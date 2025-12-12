import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { format, addDays, parse } from 'date-fns';
import csv from 'csv-parser';

@Injectable()
export class FlightScheduleParser {
  private filePath: string;
  private month: string = 'DEC';
  private currentYear: number = new Date().getFullYear();

  private rows: string[][] = [];
  private dateHeaderRowIndex = -1;
  private flightDataStartRowIndex = -1;
  private columnToDate: Map<number, Date> = new Map();
  private formattedFlights: string[] = [];

  loadFile(filePath: string) {
    this.filePath = filePath;
    this.rows = [];
    this.dateHeaderRowIndex = -1;
    this.flightDataStartRowIndex = -1;
    this.columnToDate.clear();
    this.formattedFlights = [];

    // Читаем CSV как строки, без заголовков
    return new Promise<void>((resolve, reject) => {
      const stream = fs
        .createReadStream(filePath)
        .pipe(csv({ headers: false, separator: ',' }))
        .on('data', (row) => {
          const values = Object.values(row).map((v: any) => (v ?? '').toString().trim());
          this.rows.push(values);
        })
        .on('end', () => resolve())
        .on('error', reject);
    });
  }

  async parse(): Promise<string> {
    await this.findDateHeaderRow();
    await this.findFlightDataStart();
    this.extractDateHeaders();
    this.extractFlights();
    return this.getFinalOutput();
  }

  private findDateHeaderRow() {
    for (let i = 0; i < this.rows.length; i++) {
      const firstCell = this.rows[i][0]?.toLowerCase() || '';
      if (firstCell.includes('day')) {
        this.dateHeaderRowIndex = i;
        return;
      }
    }
    throw new Error("Не найден заголовок дней недели ('day').");
  }

  private findFlightDataStart() {
    const startSearchIndex = this.dateHeaderRowIndex + 2;

    for (let i = startSearchIndex; i < this.rows.length; i++) {
      const firstCol = (this.rows[i][0] || '').trim();

      if (firstCol !== '') {
        // Если первая колонка НЕ является числом → это начало блока рейсов
        if (isNaN(Number(firstCol))) {
          this.flightDataStartRowIndex = i;
          return;
        }
      }
    }

    throw new Error('Не найдено начало блока данных рейсов.');
  }

  private extractDateHeaders() {
    const headerRow = this.rows[this.dateHeaderRowIndex];
    let currentDate: Date | null = null;

    for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
      const cell = headerRow[colIdx]?.toLowerCase() || '';

      if (cell.includes('day')) {
        const parts = cell.split(/\s+/);
        const dayStr = parts.find(p => /^\d+$/.test(p));
        if (dayStr) {
          try {
            const dateStr = `${dayStr.padStart(2, '0')}${this.month}${this.currentYear}`;
            currentDate = parse(dateStr, 'ddMMMyyyy', new Date());
          } catch {
            currentDate = null;
          }
        }
      }

      if (currentDate) {
        this.columnToDate.set(colIdx, currentDate);
      }
    }
  }

  private extractFlights() {
    const startRow = this.flightDataStartRowIndex;
    const blockSize = 3;

    // Перебираем по блокам по 3 строки
    for (let i = 0; i < this.rows.length - startRow; i += blockSize) {
      const flightRow = this.rows[startRow + i] || [];
      const routeRow = this.rows[startRow + i + 1] || [];
      const timeRow = this.rows[startRow + i + 2] || [];

      if (flightRow.length === 0) continue;

      const flightNumberRaw = flightRow[0] || '';
      const flightNumber = flightNumberRaw.split(',')[0].trim();
      if (!flightNumber) continue;

      for (let colIdx = 1; colIdx < flightRow.length; colIdx++) {
        const serviceCodeRaw = (flightRow[colIdx] || '').trim();
        const serviceCode = serviceCodeRaw ? `MFX${serviceCodeRaw}` : '';
        const route = (routeRow[colIdx] || '').trim();
        const timeRaw = (timeRow[colIdx] || '').trim();

        if (!route || !timeRaw) continue;

        // Находим дату: самая правая колонка с датой, которая <= текущей colIdx
        let flightDate: Date | null = null;
        for (const [dateCol, date] of [...this.columnToDate.entries()].sort((a, b) => a[0] - b[0])) {
          if (colIdx >= dateCol) {
            flightDate = date;
          } else {
            break;
          }
        }

        if (!flightDate) continue;

        const isNextDay = timeRaw.includes('+');
        const timeStr = timeRaw.replace('+', '').replace(/\s+/g, '');

        if (isNextDay) {
          flightDate = addDays(flightDate, 1);
        }

        const dateFormatted = format(flightDate, 'ddMMM').toUpperCase();
        const flightLine = `${flightNumber} ${serviceCode} ${route} ${timeStr}`.trim();
        const result = `${dateFormatted}\n${flightLine}`;

        this.formattedFlights.push(result); // ← push!
      }
    }
  }

  private sortKey(line: string): [Date, string] {
    const [dateStr, flightPart] = line.split('\n');
    let date = new Date(0);
    try {
      date = parse(`${dateStr}${this.currentYear}`, 'ddMMMyyyy', new Date());
    } catch {}
    return [date, flightPart];
  }

  private getFinalOutput(): string {
    const uniqueFlights = [...new Set(this.formattedFlights)]; // дубликаты убираем здесь
    const sorted = uniqueFlights.sort((a, b) => {
      const [dateA, flightA] = this.sortKey(a);
      const [dateB, flightB] = this.sortKey(b);
      return dateA.getTime() - dateB.getTime() || flightA.localeCompare(flightB);
    });

    return sorted.join('\n');
  }
}
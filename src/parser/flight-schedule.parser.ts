import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import csv from 'csv-parser';
import { format, addDays, parse } from 'date-fns';

@Injectable()
export class FlightScheduleParser {
  private filePath: string;
  private month: string = 'DEC';
  private currentYear: number = new Date().getFullYear();

  private rows: string[][] = [];
  private dateHeaderRowIndex = -1;
  private flightDataStartRowIndex = -1;
  private columnToDate: Map<number, Date> = new Map();
  private formattedFlights: string[] = []; // Массив, как в Python

  loadFile(filePath: string) {
    this.filePath = filePath;
    this.rows = [];
    this.dateHeaderRowIndex = -1;
    this.flightDataStartRowIndex = -1;
    this.columnToDate.clear();
    this.formattedFlights = []; // Очищаем массив

    return new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({ headers: false }))
        .on('data', (row: any) => {
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
      const firstCol = this.rows[i][0] || '';
      if (firstCol !== '' && isNaN(Number(firstCol))) {
        this.flightDataStartRowIndex = i;
        return;
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
    let currentIndex = this.flightDataStartRowIndex;

    while (currentIndex < this.rows.length) {
      // Пропускаем пустые строки
      while (currentIndex < this.rows.length && !this.rows[currentIndex][0].trim()) {
        currentIndex++;
      }

      if (currentIndex + 2 >= this.rows.length) break; // Не хватает строк для блока

      const flightRow = this.rows[currentIndex];
      const routeRow = this.rows[currentIndex + 1];
      const timeRow = this.rows[currentIndex + 2];

      const flightNumber = (flightRow[0] || '').split(',')[0].trim();
      if (!flightNumber) {
        currentIndex += 3; // Пропускаем блок
        continue;
      }

      for (let colIdx = 1; colIdx < flightRow.length; colIdx++) {
        const serviceCodeRaw = (flightRow[colIdx] || '').trim();
        const serviceCode = serviceCodeRaw ? `MFX${serviceCodeRaw}` : '';
        const route = (routeRow[colIdx] || '').trim();
        const timeRaw = (timeRow[colIdx] || '').trim();

        if (!route || !timeRaw) continue;

        // Находим дату: ближайшая слева
        let flightDate: Date | null = null;
        const sortedCols = [...this.columnToDate.keys()].sort((a, b) => a - b);
        for (const dateCol of sortedCols) {
          if (colIdx >= dateCol) {
            flightDate = this.columnToDate.get(dateCol) || null;
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

        this.formattedFlights.push(result);
      }

      currentIndex += 3; // Переходим к следующему блоку
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
    const unique = [...new Set(this.formattedFlights)]; // Убираем дубликаты
    const sorted = unique.sort((a, b) => {
      const [dateA, flightA] = this.sortKey(a);
      const [dateB, flightB] = this.sortKey(b);
      return dateA.getTime() - dateB.getTime() || flightA.localeCompare(flightB);
    });
    return sorted.join('\n');
  }
}
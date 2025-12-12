import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Render,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FlightScheduleParser } from '../parser/flight-schedule.parser';
import * as fs from 'fs';
import * as path from 'path';

@Controller('upload')
export class UploadController {
  constructor(private readonly parser: FlightScheduleParser) {}

  @Post()
  @UseInterceptors(FileInterceptor('csv_file'))
  @Render('index')
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    const filepath = path.join(__dirname, '../../uploads', file.filename);

    // Сохраняем файл временно
    fs.writeFileSync(filepath, file.buffer);

    try {
      this.parser.loadFile(filepath);
      const result = this.parser.parse();
      return { output: result };
    } catch (error) {
      return { output: `Ошибка: ${error.message}` };
    } finally {
      // Удаляем файл после обработки
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }
  }
}
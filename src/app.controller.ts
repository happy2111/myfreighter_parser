import {
  Controller,
  Get,
  Post,
  Render,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FlightScheduleParser } from './parser/flight-schedule.parser';
import * as fs from 'fs';
import * as path from 'path';

@Controller()
export class AppController {
  constructor(private readonly parser: FlightScheduleParser) {}

  // Главная страница
  @Get()
  @Render('index')
  index() {
    return { output: '' };
  }

  // Обработка загрузки файла
  @Post('upload')
  @UseInterceptors(FileInterceptor('csv_file'))
  @Render('index')
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { output: 'Ошибка: файл не загружен' };
    }

    const tempPath = path.join(process.cwd(), 'temp', file.originalname);
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, file.buffer);

    try {
      await this.parser.loadFile(tempPath);
      const result = this.parser.parse();
      return { output: await result };
    } catch (error: any) {
      return { output: `Ошибка парсинга:\n${error.message}` };
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }
}
import { registerCoursesHandlers } from './coursesHandlers.js';
import { registerExamsHandlers } from './examsHandlers.js';
import { registerExportHandlers } from './exportHandlers.js';
import { registerNotesHandlers } from './notesHandlers.js';
import { registerOllamaHandlers } from './ollamaHandlers.js';
import { registerSourcesHandlers } from './sourcesHandlers.js';
import { registerSystemHandlers } from './systemHandlers.js';
import { registerTasksHandlers } from './tasksHandlers.js';

let handlersRegistered = false;

export function registerAllIpcHandlers(): void {
  if (handlersRegistered) {
    return;
  }
  registerSystemHandlers();
  registerCoursesHandlers();
  registerTasksHandlers();
  registerExamsHandlers();
  registerNotesHandlers();
  registerExportHandlers();
  registerOllamaHandlers();
  registerSourcesHandlers();
  handlersRegistered = true;
}

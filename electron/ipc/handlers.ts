import { registerChatHandlers } from './chatHandlers.js';
import { registerCoursesHandlers } from './coursesHandlers.js';
import { registerExamsHandlers } from './examsHandlers.js';
import { registerExportHandlers } from './exportHandlers.js';
import { registerNotesHandlers } from './notesHandlers.js';
import { registerNotificationHandlers } from './notificationHandlers.js';
import { registerOllamaHandlers } from './ollamaHandlers.js';
import { registerReportHandlers } from './reportHandlers.js';
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
  registerChatHandlers();
  registerReportHandlers();
  registerNotificationHandlers();
  handlersRegistered = true;
}

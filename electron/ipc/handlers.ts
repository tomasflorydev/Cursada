import { registerCoursesHandlers } from './coursesHandlers.js';
import { registerExamsHandlers } from './examsHandlers.js';
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
  handlersRegistered = true;
}

// Process entrypoint: boots the Express app from app.ts and listens on
// PORT (default 3000). Used by `npm start` and the Docker image.

import 'reflect-metadata'; // required by rbac/rbac.decorator.ts's @Roles decorator
import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

app.listen(PORT, () => {
  console.log(`FitFlow Suite API listening on port ${PORT}`);
});

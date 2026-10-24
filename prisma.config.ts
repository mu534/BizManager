import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
  envFilePath: [".env.local", ".env"],
  migrate: {
    seed: {
      run: "tsx",
      args: ["prisma/seed.ts"],
    },
  },
});

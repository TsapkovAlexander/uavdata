// src/openapi.ts
const openapiDocument = {
  openapi: "3.0.3",
  info: {
    title: "UAVDATA Enrichment API",
    version: "1.0.0",
    description: "Асинхронное обогащение сообщений и массовая обработка файлов.",
  },
  servers: [{ url: "https://api.uavdata.ru" }],
  tags: [
    { name: "Health" },
    { name: "Enrich" },
    { name: "Jobs" },
  ],
  paths: {
    "/v1/health": {
      get: {
        tags: ["Health"],
        summary: "Проверка здоровья сервиса",
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } }
          }
        }
      }
    },

    "/v1/enrich/single": {
      post: {
        tags: ["Enrich"],
        summary: "Поставить в очередь единичное сообщение",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["message"], properties: {
                message: { type: "string", description: "Один сырой текст сообщения" },
                callback_url: { type: "string", format: "uri", description: "Опциональный вебхук при готовности" }
              } }
            }
          }
        },
        responses: {
          "200": {
            description: "Задача создана",
            content: { "application/json": { schema: { $ref: "#/components/schemas/JobAccepted" } } }
          }
        }
      }
    },

    "/v1/enrich/file": {
      post: {
        tags: ["Enrich"],
        summary: "Массовая загрузка файла (txt/ndjson/csv)",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary" },
                  format: { type: "string", enum: ["auto", "txt", "ndjson", "csv"], default: "auto" },
                  column: { type: "string", description: "Имя колонки с текстом (для CSV)" },
                  callback_url: { type: "string", format: "uri" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Задача создана",
            content: { "application/json": { schema: { $ref: "#/components/schemas/JobAccepted" } } }
          }
        }
      }
    },

    "/v1/enrich/status/{job_id}": {
      get: {
        tags: ["Jobs"],
        summary: "Статус задачи",
        parameters: [
          { in: "path", name: "job_id", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "Текущий статус",
            content: { "application/json": { schema: { $ref: "#/components/schemas/JobStatus" } } }
          },
          "404": { description: "Не найдено" }
        }
      }
    },

    "/v1/enrich/result/{job_id}": {
      get: {
        tags: ["Jobs"],
        summary: "Результат задачи (если готов)",
        parameters: [
          { in: "path", name: "job_id", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "Результат",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    flights: { type: "array", items: { type: "object" } },
                    logs: { type: "array", items: { type: "object" } }
                  }
                }
              }
            }
          },
          "404": { description: "Ещё не готово или нет такой задачи" }
        }
      }
    },

    "/v1/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "Список последних задач",
        parameters: [
          { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 500, default: 50 } }
        ],
        responses: {
          "200": {
            description: "ОК",
            content: { "application/json": { schema: { $ref: "#/components/schemas/JobList" } } }
          }
        }
      }
    },

    "/v1/jobs/{job_id}": {
      delete: {
        tags: ["Jobs"],
        summary: "Удалить задачу и её файлы",
        parameters: [
          { in: "path", name: "job_id", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Удалено", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "404": { description: "Не найдено" }
        }
      }
    }
  },
  components: {
    schemas: {
      JobAccepted: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          job_id: { type: "string", format: "uuid" },
          status_url: { type: "string", format: "uri" },
          result_url: { type: "string", format: "uri" }
        }
      },
      JobStatus: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          job: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              type: { type: "string", enum: ["single", "file"] },
              status: { type: "string", enum: ["queued", "processing", "done", "error"] },
              error: { type: "string", nullable: true },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" }
            }
          }
        }
      },
      JobList: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          jobs: { type: "array", items: { $ref: "#/components/schemas/JobStatus" } }
        }
      }
    }
  }
};

export default openapiDocument;
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec, spawn } from 'node:child_process'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react({
    babel: {
      plugins: [
        function (babel: any) {
          const { types: t } = babel;
          return {
            visitor: {
              JSXOpeningElement(path: any, state: any) {
                if (path.node.loc) {
                  const filename = state.file.opts.filename;
                  const line = path.node.loc.start.line;
                  const col = path.node.loc.start.column;

                  const addAttr = (name: string, value: string | number) => {
                    if (
                      !path.node.attributes.some(
                        (attr: any) => attr.name?.name === name
                      )
                    ) {
                      path.node.attributes.push(
                        t.jsxAttribute(
                          t.jsxIdentifier(name),
                          t.stringLiteral(String(value))
                        )
                      );
                    }
                  };

                  addAttr("data-source-file", filename);
                  addAttr("data-source-line", line);
                  addAttr("data-source-column", col);
                }
              },
            },
          };
        },
      ],
    },
  }),
  {
    name: 'cli-bridge',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/__ai-cli" && req.method === "POST") {
          let body = ""
          req.on("data", (chunk) => {
            body += chunk.toString();
          });

          req.on("end", () => {
            try {
              const { prompt, file, line, elementType } = JSON.parse(body);

              // for Windows we need the WSL path to avoid shell quoting issues
              const normalizedFileForWslPath = file.replace(/\\/g, "/");
              exec(`wsl wslpath -u "${normalizedFileForWslPath}"`, (pathError, wslPath) => {
                if (pathError) {
                  console.error(`\x1b[31m[Path Error]\x1b[0m ${pathError.message}`);
                  res.statusCode = 500;
                  return res.end(JSON.stringify({ status: "error", message: "Failed to convert path" }));
                }

                const unixPath = wslPath.trim();
                const safePrompt = prompt.replace(/'/g, "'\\''");

                const commandArgs = ["bash", "-lc", `agent -p --force '${safePrompt} for ${elementType} @${unixPath} on line ${line}' --model auto`];
                // to print the output of the command in same terminal
                const child = spawn("wsl", commandArgs, { stdio: "inherit" });

                child.on("close", (code) => {
                  if (code !== 0) {
                    console.error(`\x1b[31m[Cursor Error]\x1b[0m Command exited with code ${code}`);
                    if (!res.writableEnded) {
                      res.statusCode = 500;
                      res.end(JSON.stringify({ status: "error", message: `Exit code ${code}` }));
                    }
                    return;
                  }
                  console.log(`\x1b[32m[Cursor Success]\x1b[0m Changes applied successfully`);
                  if (!res.writableEnded) {
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ status: "success" }));
                  }
                });
                child.on("error", (err) => {
                  console.error(`\x1b[31m[Spawn Error]\x1b[0m ${err.message}`);
                  if (!res.writableEnded) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ status: "error", message: err.message }));
                  }
                });

              });

            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ status: "error", message: "Invalid JSON body" }));
            }
          });
        } else {
          next();
        }
      });
    },
  }
  ],
})

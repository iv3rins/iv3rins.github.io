# 验证报告

生成日期：2026-07-26

## 已执行并通过

- `node scripts/verify-architecture.mjs`：依赖方向、纯 Domain、禁止 CDN、禁止反色滤镜等架构守卫通过。
- `node scripts/check-markdown.mjs`：项目 Markdown 标题与基础格式检查通过。
- Domain 运行时测试：11 项通过。
- Application 运行时测试：3 项通过。
- Domain 与 Application 严格 TypeScript 检查：通过。
- Shell 脚本语法检查：通过。

## 当前环境未完成

当前生成环境无法解析 npm Registry（`EAI_AGAIN`），因此未能下载 Fastify、ws、Zod、Vite、tsup 等依赖，也无法在本环境执行完整 `pnpm verify`、服务端构建和浏览器端构建。

首次在可联网环境使用时必须执行：

```bash
corepack enable
pnpm install
pnpm verify
```

随后提交生成的 `pnpm-lock.yaml`，并把 CI 与部署脚本的 `--no-frozen-lockfile` 改为 `--frozen-lockfile`。在这一步完成前，不应标记为生产发布版本。

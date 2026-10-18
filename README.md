# Sex Tarot

大阿卡纳 22 张三牌阵：**过去 / 现在 / 未来**。

三张牌互不重复，每张各自 50% 概率正位或逆位。三个牌位固定对应牌面的三栏：

| 牌位 | 取哪一栏 |
|---|---|
| 过去 | 身份设定（relationship） |
| 现在 | 关系（emotion） |
| 未来 | play |

---

## 在线体验

**网页**：https://anzhi-ehzo.com/mcp/tarot/

**MCP 端点**：`https://anzhi-ehzo.com/mcp/tarot/mcp`（Streamable HTTP，无状态，只接受 POST）

想把这个端点接进自己的 AI 客户端：

```json
{
  "mcpServers": {
    "sex-tarot": {
      "type": "http",
      "url": "https://anzhi-ehzo.com/mcp/tarot/mcp"
    }
  }
}
```

---

## 三种用法

本地部署有三条路：**纯静态网页**（最简单）、**HTTP 服务**、**MCP server**（接进 AI 客户端）。

## 一、纯静态网页

不需要 Node，不需要后端。抽牌在浏览器里算，无任何网络请求。

```bash
npm run build      # 产出 build/web/
npm run preview    # http://localhost:8080 本地预览
```

`build` 和 `preview` 两条命令只用 Node 内置模块，**不用先 npm install**。

把 `build/web/` 里的东西丢到任意静态站点根目录即可，共 26 个文件、约 1.3 MB：

```
index.html
deck-core.js      抽牌逻辑
cards.json        22 张牌的全部文案
bg.jpg            底图
cards/*.webp      22 张牌面
```

> 部署到子路径（比如 `/tarot/`）也能用——页面里所有引用都是相对路径。

---

## 二、HTTP 服务

```bash
npm install
npm start          # 默认 http://localhost:8787
```

换端口：

```bash
npm start -- --port 9000
# 或
PORT=9000 npm start
```

接口：

```
GET /api/draw
→ { "ok": true, "cards": [ { position, positionLabel, state, stateLabel,
                             number, id, name, orientation, orientationLabel,
                             desc, interpret, image }, ... ] }
```

`image` 是相对于站点根的路径，形如 `/cards/00_the-fool.webp`。

---

## 三、MCP server

### stdio（本地）

```bash
node /绝对路径/src/mcp.mjs
```

**Claude Desktop**（`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "sex-tarot": {
      "command": "node",
      "args": ["/绝对路径/src/mcp.mjs"]
    }
  }
}
```

其他客户端同理：`command` = `node`，`args` = `src/mcp.mjs` 的绝对路径。

### Streamable HTTP（远程）

```bash
PORT=5014 PUBLIC_BASE_URL=https://example.com/tarot node src/mcp.mjs --http
```

端点 `POST /mcp`。反代时照抄这几项，否则 SSE 会被缓冲住：

```nginx
location = /tarot/mcp {
    rewrite ^ /mcp break;
    proxy_pass http://127.0.0.1:5014;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    chunked_transfer_encoding off;
}
```

同一端口也提供在线体验页和牌面图，`PUBLIC_BASE_URL` 决定浏览器直接打开端点时跳去哪。

### 提供的工具

#### `draw_tarot`

抽三张牌。

| 参数 | 类型 | 说明 |
|---|---|---|
| `format` | `text` \| `json` | 可选。`text`（默认）返回给人看的文本，`json` 返回结构化数据 |

#### `draw_one`

只抽一个牌位，不用凑满三张。

| 参数 | 类型 | 说明 |
|---|---|---|
| `position` | `past` \| `now` \| `future` | 必填。`past` 取身份设定、`now` 取关系、`future` 取 play |
| `format` | `text` \| `json` | 可选 |

#### `list_cards`

列出全部 22 张（编号 / 中文名 / 英文 id），不带文案。无参数。

#### `get_card`

取单张牌六个格子的完整文案。

| 参数 | 类型 | 说明 |
|---|---|---|
| `card` | `string` | 牌编号（`0`-`21`）或英文 id（`the-fool`）或中文名（`愚者`） |

---

## 目录

```
data/cards.json          22 张牌的全部文案（desc + interpret × 正逆 × 三栏）
public/index.html        网页
public/deck-core.js      抽牌核心，浏览器和 Node 共用
public/cards/*.webp      22 张牌面（700×1058）
public/cards.json        文案副本，静态页读这个
public/bg.jpg            底图
src/deck.mjs             Node 侧牌组加载
src/mcp-server.mjs       工具定义，stdio 和 HTTP 共用
src/mcp.mjs              入口：stdio 或 --http
src/mcp-http.mjs         远程 MCP 的 HTTP 层
src/server.mjs           HTTP 服务（抽牌接口）
tools/gen-cards.mjs      牌面图重新生成脚本（可选）
tools/build-static.mjs   产出 build/web/
tools/serve-static.mjs   本地预览
```

依赖只有两个，且只有 MCP 那条路用得上：`@modelcontextprotocol/sdk`、`zod`。
纯静态网页和 HTTP 服务都是零依赖。

牌面图入库的只有 700×1058 的 webp（22 张约 1.1 MB）。1024×1536 的原始 PNG 不进仓库，
要的话自己用 `tools/gen-cards.mjs` 重画。

---

## 改文案

`data/cards.json` 是唯一数据源，结构：

```json
{
  "id": "the-fool",
  "name": "愚者",
  "number": 0,
  "states": {
    "relationship": { "upright": { "desc": "...", "interpret": "..." }, "reversed": { ... } },
    "emotion":      { ... },
    "play":         { ... }
  }
}
```

改完之后，22 张牌 × 六格（3 栏 × 正逆）里 `desc` 和 `interpret` 一个都不能空——空了页面会显示空白。

改完跑一次 `npm run build`，`public/cards.json` 和 `build/web/cards.json` 会一起更新。

---

## 重新生成牌面图

`tools/gen-cards.mjs` 调图像模型重画，把 `assets/original/` 里同名的原图当参考图一起发，锁住画风和配色。任何兼容 OpenAI Images 协议的端点都能用：

```bash
export IMAGE_API_KEY=sk-xxx
export IMAGE_BASE_URL=https://your-endpoint.example.com/v1   # 可省略
export IMAGE_MODEL=gpt-image-2                               # 可省略

node tools/gen-cards.mjs                 # 全部（已存在高清的跳过）
node tools/gen-cards.mjs --only 15       # 只画 15 号
node tools/gen-cards.mjs --force         # 强制重画
```

走 `/v1/images/edits`（有参考图）或 `/v1/images/generations`（无参考图）。
`--pause` 控制每张之间的间隔，默认 8000 毫秒。

> 生成内容会过上游安全审核。提示词里避免直接写 `nude` / `naked`，改用 `in flowing robes` 之类的说法，同一个画面照样成立。

生成的是 1024×1536 PNG。要转成网页用的 webp：

```bash
# 需要 ImageMagick
for f in public/cards/*.png; do
  cwebp -q 82 -resize 700 0 "$f" -o "${f%.png}.webp"
done
```

---

## 许可

代码 MIT。

牌面图（`public/cards/*.webp`）是 AI 生成的，随便用，不需要署名。

文案（`data/cards.json`）也随便用。

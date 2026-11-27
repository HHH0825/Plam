# 收纳位置试点逐文件施工表

返回[需求与架构](README.md)，参见[实施与验收](acceptance.md)。表中的文件路径以仓库根目录为基准。「新增」表示施工阶段计划创建。

## 1. 唯一的跨层契约

`wechat/react-pilot/src/contracts/storage-locations.ts` 是协议的唯一来源。下面是该文件应导出的类型签名。通过 TypeScript 为原生端生成 CommonJS，Taro 端直接使用源类型。标识统一采用安全正整数，`null` 代表未设置位置。文本均为字符串，列表空时为 `[]`，计数为非负安全整数。

```ts
export type LocationId = number | null
export type LocationRow = Readonly<{ id: number; name: string; count: number }>
export type ItemRow = Readonly<{
  id: number
  name: string
  category: string
  status: 'active' | 'idle'
  statusText: string
  storageLocationName: string
  checked: boolean
  alreadyHere: boolean
  imageSrc: string
}>
export type TargetRow = Readonly<{ id: LocationId; name: string }>

export type StorageLocationsModel = Readonly<{
  version: 1
  viewEpoch: number
  loading: boolean
  ready: boolean
  busy: boolean
  conflict: boolean
  error: string
  mode: 'locations' | 'items'
  locationId: LocationId
  locationName: string
  assignItemId: number | null
  query: string
  itemQuery: string
  targetQuery: string
  locationCount: number
  unassigned: number
  shownLocations: readonly LocationRow[]
  shownItems: readonly ItemRow[]
  naming: boolean
  renameId: number | null
  nameDraft: string
  picking: boolean
  selecting: boolean
  chosenCount: number
  targetOpen: boolean
  targets: readonly TargetRow[]
}>

export type IntentAction =
  | { type: 'retry' | 'review-conflict' | 'back-to-locations' }
  | { type: 'start-create' | 'start-rename' | 'delete-location' | 'save-name' | 'cancel-name' }
  | { type: 'start-add' | 'start-selection' | 'cancel-selection' }
  | { type: 'choose-target' | 'close-target' | 'add-selected' | 'clear-selected' }
  | { type: 'search-locations' | 'search-items' | 'search-targets' | 'edit-name'; value: string }
  | { type: 'open-location' | 'select-target'; id: LocationId }
  | { type: 'tap-item'; id: number }
  | { type: 'photo-failed'; id: number; src: string }

export type StorageLocationsIntent = Readonly<IntentAction & { version: 1; viewEpoch: number }>
export type StorageLocationsProps = Readonly<{
  model: StorageLocationsModel
  onIntent: (intent: StorageLocationsIntent) => void
}>

export declare function initialModel(viewEpoch: number): StorageLocationsModel
export declare function parseModel(input: unknown): StorageLocationsModel | null
export declare function parseIntent(input: unknown): StorageLocationsIntent | null
```

- `initialModel(0)` 用于组件挂载前和只读初始化。初始状态为 `loading=true`、`ready=false`、`mode='locations'`，其余布尔为 false，字符串为空，计数为 0，所有 ID 为 null，各列表为空。页面显示后使用正整数 `viewEpoch`。每次 show、资料库更换、详情位置或交互模式切换时同步更新有效期，hide 和 unload 立即失效。交互模式由 `mode`、`naming`、`renameId`、`picking`、`selecting`、`targetOpen` 决定。输入文本、选择数量和照片路径变化沿用当前有效期。控制器另用 `_seq` 判断读取是否过时。这些标记只存于内存。
- `parseModel` 校验枚举、字段类型、列表行、数字和版本。验证失败返回 null，组件显示只读错误状态。未就绪模型只能发出当前可见的重读操作。原生控制器仍负责验证允许的状态、目标和范围。
- `parseIntent` 对普通对象按动作校验必需字段，拒绝未知字段、未知版本、未知操作、数值字符串、非法数字和缺失值。`photo-failed.src` 必须非空。输出仅包含该动作白名单字段，输入校验失败时返回 null。
- 微信与 Taro 的外层传输统一由两端入口处理。最小试验采用原生 WXML `props="{{storageReactProps}}"` 和其对象内稳定的 `onIntent` 回调。React 每次提交一个完整 intent，原生回调收到该对象后调用 `dispatchIntent`。若实际微信/Taro 生成链需要调整外层接线，只修改入口和组装测试，并在分工前写明已实测传输形状。内部 V1 对象保持上述签名。
- 只从投影生成业务展示字段。原始物品、记录 revision、资料目录、凭证和后端响应不经过视图边界。照片路径仅作为当前渲染用的 `imageSrc`，失败事件回传同一字符串。操作的确认和结果来自下一份模型，回调返回不得驱动乐观更新。

## 2. 操作分发表

原生桥接接口为 `dispatchIntent(page, input): Promise<boolean>`。返回 true 表示操作通过桥接并已交给固定方法。业务成功、取消和冲突以控制器模型为准。返回 false 表示输入或当前上下文不接受该动作，控制器方法不被调用。桥接只绑定表内的方法和参数。带 id 的兼容参数为 `{currentTarget:{dataset:{id}}}`，其中 null 仅在这个边界转成原生的 0。带 value 的参数为 `{detail:{value}}`。

| V1 操作 | 控制器方法 | 输入和前置条件 |
|---|---|---|
| retry | load | 读取失败后重读，当前没有进行中的读写或确认 |
| review-conflict | review | 冲突时重读最新记录，保留仍有效的选择 |
| search-locations | search | 位置列表的 value |
| search-items | searchItems | 物品列表的 value |
| search-targets | targetSearch | 已打开目标选择器时的 value |
| open-location | enter | 可见位置 id 或 null，直接分配时进入确认 |
| back-to-locations | groups | 从物品列表返回 |
| start-create | newLocation | 位置页打开新建 |
| start-rename | rename | 当前为真实位置，且处于允许编辑的详情状态 |
| delete-location | remove | 当前为真实位置，沿用原生确认 |
| edit-name | nameInput | 已打开名称表单时的 value |
| save-name | saveName | 名称表单打开，沿用去首尾空白、1–40 字和查重 |
| cancel-name | cancelName | 退出名称表单 |
| start-add | beginAdd | 从位置详情打开添加物品模式 |
| start-selection | beginSelect | 从位置详情开始多选 |
| cancel-selection | cancelSelect | 选择中，当前无写入 |
| tap-item | tapItem | 可见且可操作的物品 id |
| choose-target | chooseTarget | 多选有记录且可提交时打开目标列表 |
| close-target | closeTarget | 目标列表已打开且当前无写入 |
| select-target | targetTap | 已打开目标列表，且 id 在当前列表或为可见的 null 目标 |
| add-selected | addSelected | 添加模式且存在可提交的选择 |
| clear-selected | clearSelected | 普通多选模式且存在可提交的选择 |
| photo-failed | photoFailed | id 仍在展示中，并且 src 与当前投影严格一致 |

活动页面、有效期、scope、busy 和动作模式由原生校验。提交时目标 id 和 revision 从控制器当前记录读取。批量请求沿用已选记录的 revision，遇到 409 或 428 保留选择供用户核对。控制器在确认结束后再次检查页面与数据 scope，并从最新显示上下文验证动作仍成立，同时保留已经交付给用户确认的记录 revision，由本地业务校验。取消、快速连点、隐藏及过期确认不会发第二笔或偷偷重试。确认与写入采用页级所有者标记，在各自 `finally` 中按标记释放，旧异步回调不能释放新操作的锁。

## 3. 既有代码复用

| 现有文件 | 输入 → 输出 | 试点施工边界 |
|---|---|---|
| `wechat/miniprogram/pages/storage-locations/index.js` | 微信路由与生命周期 → 原生页面对象 | 控制器提取后改成短注册入口，使用原有 `member.wrap`。 |
| `wechat/miniprogram/pages/storage-locations/index.wxml` | 原生控制器数据 → 收纳原生 UI | 保留原生对照与恢复路径。供 React 组件比对事件、初态和反馈。 |
| `wechat/miniprogram/pages/storage-locations/index.wxss` | 原生样式规则 → 现有布局 | 保留对照。React 重建必要的局部样式并承接主题。 |
| `wechat/miniprogram/pages/storage-locations/index.json` | WeChat 页面声明 → 标题与三个原生组件 | 保留原生声明。试点另有覆盖文件。 |
| `wechat/miniprogram/utils/member.js`、`utils/share.js`、`utils/motion.js` | 页面定义 → 主题、通用分享与减少动态效果 | 继续使用现有包装，保持 `Page` 单次注册。 |
| `wechat/miniprogram/utils/api.js`、`wechat/tools/local-template/api.js` | 请求选项、版本、照片缓存所有者 → 资料或错误、缩略图句柄 | 控制器继续调用 `request` 和 `photoCache`，发布构建使用纯本地模板。 |
| `wechat/miniprogram/local-core/runtime.js` | 当前运行时 → `scope()`、本地业务等 | 通过现有 `scope()` 确认资料库实例。token 相同的情况下，资料恢复仍须使旧上下文失效。 |
| `wechat/miniprogram/templates/session-status.wxml` | 应用准备／恢复状态 → 原生状态反馈 | 原生外壳继续包含该模板并复用现有反馈组件。 |

收纳读取为 `GET /storage-locations` → `{locations, unassigned_count}`，以及 `GET /items` → 物品数组。位置创建 `POST /storage-locations` 与改名 `PUT /storage-locations/:id` 使用 `{name}`，改名与删除 `DELETE /storage-locations/:id` 延续已有 revision 选项。移动 `POST /storage-locations/assign` 使用 `{storage_location_id, items:[{id, revision}]}`，清除用 null。上述是原有本地调用约定。业务层负责全有或全无的写入、删除位置时释放关联及真实结果。

## 4. 逐文件施工

各组只认各自下表列出的文件。M1 契约冻结、M2 最小试验完成后，B 与 C 可独立开发，D 负责组装，E 验证同一份契约。采用低耦合的接口与可执行测试实现可靠组合。

| 所属 | 文件 | 输入 → 输出 | 代码健壮性要求 |
|---|---|---|---|
| A 契约 | `wechat/react-pilot/src/contracts/storage-locations.ts`（新增） | unknown → V1 模型／操作或 null，导出共享初始状态 | 纯函数，无 React、微信实例和文件依赖。投影与校验只有一套协议定义。 |
| B 控制器 | `wechat/miniprogram/pages/storage-locations/controller.js`（新增） | `createStorageLocationsPage({onStateChange?})` → 原生页面定义 | 用 `update(patch, callback?)` 调用原生 `setData`，并在原生数据同步更新后通知 `onStateChange(page)`。每实例独立，保留回调语义，照片点路径仍用原生规则。只接触现有 API、scope 和导航。 |
| B 控制器 | `wechat/miniprogram/pages/storage-locations/index.js`（改动） | 无参工厂和微信生命周期 → 单个原生 Page | 继续通过 `member.wrap` 注册，兼容既有绑定。无 React 或试点依赖。 |
| B 控制器 | `wechat/react-pilot/native/project-view-model.js`（新增） | `projectModel(data, viewEpoch)` → `StorageLocationsModel` | 纯函数只取白名单。包含空列表和 `locationCount`。按现有缩略图优先、分类插画回退次序计算 src，每行产生新只读语义的 DTO。|
| B 控制器 | `wechat/react-pilot/native/dispatch-intent.js`（新增） | `dispatchIntent(page, input)` → 是否已分发 | 用共享编译契约校验，显式映射每个动作。拒绝过期、隐藏、无效目标和失效图片，不信任 UI revision。 |
| B 控制器 | `wechat/react-pilot/native/index.js`（新增） | 工厂、投影、分发器、微信生命周期 → 试点原生 Page | 包装同一个控制器。页面实例复用稳定回调，回调只校验事件明确携带的有效期。状态通知同步检查交互上下文变化，每个微任务批次最多发布一次投影并取最新 `page.data`。发布前核对当前页仍活动，并直接调用 `setData`，避免触发下一次投影。 |
| B 控制器 | `wechat/react-pilot/native/index.wxml`（新增） | 主题字段、原生加载和 `storageReactProps` → 主题外壳与视图组件 | 使用现有容器类；原生猫咪加载、反馈及 session-status 各保留一个。组件只接收声明的 props。 |
| B 控制器 | `wechat/react-pilot/native/index.json`（新增） | 现有收纳配置和试点组件路径 → 页面组件声明 | 比原生配置只增加 `storage-react`，路径固定为同分包内的 `./react-build/components/storage-locations/index` 组装入口。 |
| C 视图 | `wechat/react-pilot/src/components/storage-locations/index.tsx`（新增） | Taro props → 页面视图与操作回调 | 验证模型，原样传入共享回调。渲染、挂载以及模型变化不触发写入。使用原生 Taro 组件。 |
| C 视图 | `wechat/react-pilot/src/components/storage-locations/StorageLocationsView.tsx`（新增） | `StorageLocationsProps` → 标题、提示、错误与子视图 | 根据 mode/naming/targetOpen 组合子组件。绑定当前 viewEpoch 后上报。显示未就绪/错误/冲突，保留刷新核对。 |
| C 视图 | `wechat/react-pilot/src/components/storage-locations/LocationList.tsx`（新增） | 位置列表、查询、总数、未分配数、状态 → 列表 UI、打开／创建／搜索意图 | 显式区分空列表与无匹配，null 行有独立 key 与文案。 |
| C 视图 | `wechat/react-pilot/src/components/storage-locations/ItemList.tsx`（新增） | 物品行、详情模式与选择计数 → 物品 UI、展示操作及图片错误意图 | 按 id 稳定渲染，已在当前位置的物品在添加模式不可选，报出失败时的具体 src；显示名称分类、状态与位置。 |
| C 视图 | `wechat/react-pilot/src/components/storage-locations/LocationNameForm.tsx`（新增） | 是否新建、名称草稿、busy → 受控输入和提交／取消意图 | 保留原生输入长度反馈，业务端按字符复核。保存与取消按当前提交状态禁用。 |
| C 视图 | `wechat/react-pilot/src/components/storage-locations/BatchActions.tsx`（新增） | picking、selecting、chosenCount、busy、conflict → 批量按钮和操作 | 0 选择、忙碌及冲突均抑制提交。React 不清空已有选择。 |
| C 视图 | `wechat/react-pilot/src/components/storage-locations/TargetDialog.tsx`（新增） | 目标列表、查询和提交状态 → 目标选择器与对应操作 | 列表可滚动，null 项可选，长名称可换行，关闭和选择只发一个意图。 |
| C 视图 | `wechat/react-pilot/src/components/storage-locations/index.css`（新增） | 收纳内容语义类、现有主题变量 → 组件局部样式 | 使用显式类和局部作用域，禁用态可辨识。支持小屏、键盘、放大字号和减少动态效果。 |
| D 构建 | `wechat/react-pilot/package.json`（新增） | 验证后的依赖和脚本名 → `check`、`dev:weapp`、`build:weapp` | Taro 套件同版本，使用本地 CLI，记录 npm 版本。 |
| D 构建 | `wechat/react-pilot/package-lock.json`（新增） | npm 解析的依赖树 → 固定安装结果 | 由 npm 生成，CI 用 `npm ci`，提交依赖变更时同时更新。 |
| D 构建 | `wechat/react-pilot/.node-version`（新增） | M0 选定的 Node 完整版本号 → CI 和本机版本输入 | 与实际构建证据对应。 |
| D 构建 | `wechat/react-pilot/tsconfig.json`（新增） | TS/TSX → 严格类型检查结果 | 类型检查覆盖所有试点 TS 模块。 |
| D 构建 | `wechat/react-pilot/tsconfig.contracts.json`（新增） | V1 TypeScript 源 → 收纳协议的 CommonJS | 生产和测试消费同一份生成代码，独立输出进忽略路径。 |
| D 构建 | `wechat/react-pilot/config/index.ts`（新增） | Taro 项目与 Webpack 设定 → 组件构建配置 | WXSS 和产物目录在最小试验中验证；保持能追溯每个依赖的归属。 |
| D 构建 | `wechat/react-pilot/src/app.config.ts`（新增） | 已知组件入口 → Taro `components` 配置 | 仅声明收纳组件入口。 |
| D 构建 | `wechat/react-pilot/src/app.tsx`（新增） | Taro 编译要求 → 最小应用入口 | 供编译器使用，业务生命周期与最终的 App 注册仍由微信原生入口负责。 |
| D 构建 | `wechat/tools/package.json`（新增） | 选定的 Terser → 原生压缩工具依赖 | 与 Taro 依赖隔离，从仓库相对位置读取。 |
| D 构建 | `wechat/tools/package-lock.json`（新增） | 已验证的实际 npm 工具依赖 → 固定安装结果 | 用构建回归验证 Terser 更新。 |
| D 构建 | `wechat/tools/build-local-variants.cjs`（改动） | 原生源码、纯本地模板、固定压缩器 → 原生项目与清单 | 保留默认命令、包体和安全检查。做压缩输出回归。兼容原工具的本机档案脚本仍可复核。 |
| D 构建 | `wechat/tools/build-react-pilot.cjs`（新增） | 当次原生构建、Taro 产物、桥和契约 → 独立试点项目与清单 | 验证路由、源文件哈希、文件边界和依赖闭包。只覆盖收纳四件套中的 JS、JSON、WXML，保留原生页面 WXSS。完整产物验过再公开候选路径。 |
| D 构建 | `wechat/tools/package-sizes.cjs`（沿用） | 构建文件大小和分包表 → 分包统计、超限报错 | 继续使用已有阈值，并验证两种候选的包边界。 |
| D 构建 | `.gitignore`（按需补齐） | 候选项目、依赖、编译暂存及本地副本路径 → 忽略规则 | 规则须精准，以免漏掉公共契约、锁文件和源码。 |
| D 构建 | `.github/workflows/wechat-check.yml`（新增） | 仓库源码与锁定环境 → 持续集成结果 | PR／push 运行安装、构建、回归与包体检查，仅使用合成资料。微信编译仍由隔离工具执行。 |
| E 验收 | `wechat/tests/storage-locations.test.cjs`（改动） | 原有用例、控制器及页面桩 → 原生行为回归 | 使现有 VM 加载新增 CommonJS 控制器，保留既有断言。验证确认取消、重复点击、scope 变化和过期结果。 |
| E 验收 | `wechat/tests/react-storage-contract.test.cjs`（新增） | 两端编译后的同一契约和固定数据 → 协议回归 | 覆盖所有操作、版本、空态、非法 ID、投影白名单及错误图片来源。 |
| E 验收 | `wechat/tests/react-storage-bridge.test.cjs`（新增） | 实际投影和分发，控制器 VM、V1 事件 → 桥接与控制器集成结果 | 校验映射、锁、失效操作、冲突重读和错误回退。保存操作以写入次数、请求内容和结果验证。 |
| E 验收 | `wechat/tests/react-storage-build.test.cjs`（新增） | 本次生成的两份清单、引用关系与实际文件 → 组装检查 | 对照路由、分包、隐私、禁止的 API、包体和生成目录。输出缺失或与源码哈希不匹配时报错。 |

原生提取时，`update` 逐步替换控制器内调用。运行时的当前资料 scope 在取得有效的本地实例后作为读取和写入时的上下文。打开时为 `pending` 则等既有准备就绪后重新读取。发现 scope 更换时清除旧展示和已选状态、释放缩略图并重读。现有 404 的「同步云端版本」文案属于独立文案修正，施工时由维护者决定是否在原生基线先修并同步更新断言。

### React 子组件的调用签名

每个文件导出同名函数组件。除入口外只使用命名导出。`StorageLocationsView` 接收 `StorageLocationsProps`，子组件共同约定 `emit: (action: IntentAction) => void`。主视图将 `version` 和当前 `viewEpoch` 写入 Action，再调用 `onIntent`。各子组件接收该表列出的模型同名字段，类型通过 `Pick<StorageLocationsModel, ...>` 引用，业务状态不复制给组件本地变量。

| 子组件 | model 字段，另外传入 emit | 发出的动作 |
|---|---|---|
| `LocationList` | `shownLocations, query, locationCount, unassigned, busy` | search-locations、start-create、open-location |
| `ItemList` | `locationId, locationName, itemQuery, shownItems, picking, selecting, chosenCount, busy` | back-to-locations、start-rename、delete-location、search-items、start-add、start-selection、cancel-selection、tap-item、photo-failed |
| `LocationNameForm` | `renameId, nameDraft, busy` | edit-name、save-name、cancel-name |
| `BatchActions` | `picking, selecting, chosenCount, busy, conflict` | add-selected、choose-target、clear-selected |
| `TargetDialog` | `targetQuery, targets, busy, conflict` | search-targets、close-target、select-target |

主视图根据 `ready` 和 `loading` 控制可交互内容，`assignItemId` 用于直接分配提示，主视图自身发出 retry 与 review-conflict。合成视图样例至少包含初始、空位置、详情选择、表单、冲突、目标弹窗和直接分配。图片报错必须绑定渲染该图片时的 id 与 src。

### 供双端对照的例子

| 输入 | 期望结果 |
|---|---|
| `initialModel(0)` | 显示原生加载，用户操作不得进入控制器。 |
| 当前实例和有效期为 2，收到 `{"version":1,"viewEpoch":2,"type":"open-location","id":null}` | 列表可操作时调用 `enter`，原生 dataset id 为 0。 |
| 同一个动作携带 `"id":0`、`"id":"2"` 或上一个详情位置的有效期 | 返回 false，无页面方法调用。 |
| 显示物品 id 为 6，当前 src 是新图，收到同一 id 的旧图失败事件 | 返回 false，新图保留。 |
| 有效批量移动遇到 409 或 428 | 意图已分发，显示冲突和原选择。刷新后再出具确认。 |

## 5. 可直接交给不同 AI 的施工指令

> 先读取本文件、需求文档和验收文档，只编辑分配给你的文件。以 V1 签名、动作表和现有本地版行为为准。引用跨组文件时，只使用文档中声明的接口。每个异步路径说明读取、完成、取消、过期和报错行为，提交时给出变更文件列表、运行命令、结果和仍需验证的项。若需要新增字段或修改别组接口，提供最小复现和契约变更提议，等集成负责人确认后同步给所有组。用公开合成测试数据，避免在日志或补丁中带入设备路径、账号、照片和账目。

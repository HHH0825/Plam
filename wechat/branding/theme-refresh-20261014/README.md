# 猫咪、登录页与统计切换栏素材

## 锁定版本

- `approved-login.png`：最新版登录页，唯一登录视觉基准。
- `approved-board.png`：第一版整组草图，仅左列猫咪和右列切换栏作为本轮基准；中央旧登录页不作为实现基准。
- `design-tokens.json`：390px布局及素材预算标注。

## 运行来源

- `hero-source.png`：最终登录插画，恢复原稿账本高度并校正“我的小物”标签。
- `title-source.png`：独立透明手写标题。
- `cat-search-source.png`、`cat-book-source.png`、`cat-camera-source.png`：运行猫咪原稿。
- `cat-sleep-source.png`：睡觉造型设计原稿，未进入小程序包。
- `switch-*.svg`、`welcome-*.svg`：可编辑图标、原品牌图标和手绘边框；运行时使用其PNG版本。
- `share-fallback.svg`：默认分享封面源，使用新版读书猫。
- `hero-source-initial.png`：过程稿，不用于运行；最终生成入口只读取`hero-source.png`。

复杂插画由内置image_gen按确认稿整理为高分辨率透明PNG。提示及来源见`asset-prompts.json`；边框和图标使用独立SVG。标题、插画、示例卡和按钮分别实现，页面没有使用整张草图背景或整套字体。

## 生成入口

在项目根目录运行`node wechat/tools/prepare-theme-refresh.cjs`。它更新登录素材、三只运行猫咪、默认分享封面及统计图标，并检查300KiB／200KiB预算。

旧的登录素材生成入口已委托到新版流程；旧白色主题生成入口中的几何猫生成器已移除，猫咪步骤也委托到新版流程。重建时不会恢复旧款猫或旧登录插画。其余导航、头像、菜单图标仍沿用现有来源。

图片尺寸优化保持透明背景和原比例；原始高分辨率稿保留在本目录。此目录位于小程序目录之外，不进入运行包。

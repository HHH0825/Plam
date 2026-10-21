# 添加与发现页效果图细节补齐 · 2026-10-08

## 本次修改

- 添加／编辑页改为低对比横线纸、波浪纸边、绿色胶带及邮戳，右侧使用水彩橘猫拿相机。
- 照片入口为同排的相机占位、说明与选择按钮；有原照片时显示原缩略图，裁剪、旋转和状态提示在下方，原事件、禁用与重试约定保留。
- 01／02／03 使用绿色撕边胶带及斜体数字，前两组右侧加入淡粉猫爪，备注右侧保留“可选”。
- 发现页改为淡粉横线纸、左侧虚线、绿色胶带、圆形生活收藏邮戳和拿猫爪账本的水彩橘猫。
- 文字、金额、输入与按钮使用原生组件，装饰图片不接收点击。保存按钮仍用指定的原长纸片，底部导航仍用原三个图标。
- 两页新增的 PNG 合计约 184 KiB，其中两只透明猫咪合计约 138 KiB；高清源图留在 branding，不放入小程序资源目录。没有远程装饰请求。

## 素材及生成记录

水彩猫咪使用内置 `image_gen`，两次独立调用均设置 `transparent_background: true`，以先前生成的两页设计图为参考；生成后保存原图，在项目内缩小为 384×384、保留透明通道的版本。使用内置工具，没有 API CLI 调用。

提示词要点：

1. 相机猫：从添加页参考的左屏右上角提取并重新绘制同款橘白水彩小猫。保留友好的面部特征、坐姿、完整身体及蓬松弯尾，怀抱黑色复古相机，少量桃色兴奋线条。真实透明背景，方形中央构图约占 82%；去除纸张、界面、文字、地面和投影。
2. 账本猫：从发现页参考的左屏右上角提取并重新绘制同款橘白水彩小猫。保留友好面部特征、完整坐姿及蓬松竖起的弯尾，怀抱奶油白螺旋账本，封面有棕色猫爪。真实透明背景，方形中央构图约占 82%；去除纸张、界面、文字、邮戳、地面和投影。

参考文件分别为 `exec-5f47d964-7dc9-4d64-a7c5-6a6e6ece7d8a.png`、`exec-20a37192-86e2-499b-b17a-be0a7178311f.png`。内置生成结果分别为 `exec-b659ffb2-a37f-47f1-8664-5bfc1c3cfe8d.png`、`exec-c4543de8-c28a-4581-860b-afd0a822bf07.png`，原文件保留。

项目内交付：

- [相机猫源图](../branding/editor-discovery-v2/camera-kitten-v2-source.png)、[页面相机猫](../miniprogram/assets/editor-discovery/camera-kitten-v2.png)。
- [账本猫源图](../branding/editor-discovery-v2/journal-kitten-v2-source.png)、[页面账本猫](../miniprogram/assets/editor-discovery/journal-kitten-v2.png)。
- 纸张、胶带与图标为可编辑本地 SVG，通过 `tools/export-editor-discovery-art.cjs` 导出 PNG；水彩插画没有用简单矢量替代。旧素材未覆盖。

## 验证

- 本次相关现有回归 32 项通过：草稿、照片开关、裁剪／旋转、上传重试、保存去重、版本及账号保护、发现数据读取与导航。
- 26 组实际模板的离线布局检查通过，覆盖 320／390／430／768px，以及关闭／失败／加载／上传、原照片、版本冲突、草稿、空发现、大金额、多条纪念等情况。检查无横向溢出、全部图片有效、按钮至少 44px、照片选择同排、三个胶带编号及两枚猫爪、保存纸片等宽、装饰不截获点击。
- 微信模拟器真实截图已经查看：[添加首屏](images/editor-discovery-refresh/fidelity-live-editor-top.png)、[购买／备注与保存](images/editor-discovery-refresh/fidelity-live-editor-lower.png)、[水杯编辑与原照片](images/editor-discovery-refresh/fidelity-live-editor-photo.png)、[发现首屏](images/editor-discovery-refresh/fidelity-live-discovery-top.png)。
- 原水杯照片成功读取。真实统计仍显示 3 件、净成本 2905.93、购买 3305.91、维修 100.02、回收 500.00。没有保存、覆盖或删除真实物品，没有修改照片开关。

## 交付范围

本地客户端已经接入以上细节。微信体验版未上传更新；本次没有云函数部署。手机端键盘、滚动、选图和实际保存效果仍待用户真机复核，不把模拟器结果当作手机验收。

## 后续修订：输入框聚焦与发现页融合

- 根据用户的聚焦截图，将名称、分类和购买价格的边框、圆角、水平留白移到外层 `field-input`。原生单行输入框自身使用无边框、无上下内边距的 24px 文字区域，在 48px 外框内垂直居中；保持原 maxlength、事件、数值类型和数据绑定。
- 模拟器普通 `tap` 没有使原生 focus 属性变为 true，未将该调用计作有效聚焦证据。验证时临时将名称框 focus 属性与现有 focusField 绑定，受控触发空框聚焦，读取原生 focus=true 后截图；退出聚焦后再次截图。两张实际截图中提示文字的垂直位置一致：[聚焦状态](images/editor-discovery-refresh/focus-fixed.png)、[未聚焦对照](images/editor-discovery-refresh/focus-fixed-idle.png)。临时 focus 绑定已从交付代码移除并重新编译，没有输入或保存真实数据。
- 发现页猫咪从 120×132 调整为 150×164px，顶部构图从 148px 加高到 180px；窄屏使用 122×142px。粉纸改用 `header-discovery-v3.svg/png` 的不规则撕边、渐淡下缘、轻微外围颗粒，保留 60%透明度。缩短与统计卡片的间距，让猫咪底部与纸张边缘自然衔接。
- [最新微信发现页截图](images/editor-discovery-refresh/discovery-harmonized.png) 已实际查看。最终 32 项相关回归与 26 组布局检查通过，宽度为 320／390／430／768px。手机键盘状态仍待真机复核；未上传体验版、未部署云端。

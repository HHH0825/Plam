# 大金额排版与个人页面分区

## 已实现

- 小小发现预览保留完整金额及两位小数。购入件数固定占64px，黄色金额区使用剩余空间；按真实文字宽度尝试26／24／22／20px。两列放不下时金额独占下排，极端值仅金额行横向查看，不拆数字、不使用省略号。净支出、净回收、持平和空状态沿用上一轮规则。
- 个人购入总额不足万元显示完整值，达到万元／亿元显示“约 ¥…万／亿”，保留两位小数。十进制字符串直接缩放、四舍五入；例如17,551.90→约 ¥1.76万，99,999,950.00→约 ¥1.00亿，不经过浮点数。原始完整值独立保留。
- 金额区域至少44px可点击，打开白色圆角弹窗，展示完整金额、“按当前持有物品统计”和“知道了”。极端金额仍可横向查看。打开隐藏底部导航，关闭、刷新和离开页面恢复导航；账户切换关闭弹窗并清除金额。无障碍描述包含完整金额。
- 个人概览优先三列，按实际宽度尝试20／18／16px；放不下时持有件数、使用天数在上，金额独占下排。测量包含账号、请求序号、可见状态及最新测量标识，迟到结果不影响新页面。金额行高度也使用实际测量的文字高度，避免大字体被裁掉。
- 头像／统计与“我的收藏册”之间增加淡黄手绘虚线与居中猫爪。复用现有素材并裁掉素材内部留白，不增加图片、不接收点击。
- 退出当前账户使用浅粉 `#FFF0F3` 背景、`#F0CED7` 边框和深灰文字，按下为 `#FBE3EA`。保留48px高度、底部安全间距及原退出行为。

## 接口及兼容

无新增接口、字段、集合、索引或迁移，无需更新后端。`held_purchase_total` 及月报 `cashflow_net` 原值与计算保持不变，完整月报和导出图片不使用缩写，物品净成本真实负值保留。

加载、读取失败和旧后端缺少金额时保留原来的占位及提示，禁用查看。重试清除旧错误，账户切换清除完整金额、缩写和弹窗；个人统计与资料请求仍独立处理。

本轮仅本地交付，未部署云函数、未上传体验版、未操作云端真实账户记录。

## 验证

- 55项金额、月报和小小发现测试通过；另12项个人概览、资料、退出与配色回归通过，共67项相关测试。覆盖万元／亿元边界、舍入进位、分值精度、零值、极端金额、旧后端、加载、失败重试、迟到测量及账户隔离。
- 月报测试保留净回收／持平／空状态、月份切换、图片缓存失效和分享回退。个人设置与退出使用隔离运行结果回归，没有执行真实退出写入请求。
- 128组离线布局通过：320／390／430／768px、普通与1.3倍文字，320px同时使用640px短屏；覆盖月报预览、普通／完整／零／进位／极端个人金额、弹窗及加载／旧后端／错误。检查整页无横向溢出、金额单行且高度不裁切、允许滚动时完整可读、44px点击高度、弹窗文字高度、退出按钮配色和滚至末尾不被导航覆盖。
- 微信模拟器18项金额、弹窗、失败重试和头像设置入口检查通过；独立补充5项旧后端、账户切换、底部设置及禁止写入检查通过，见 `native-results.json`、`native-tail-results.json`。使用内存演示账户与响应，完成后恢复原账户、请求方法与偏好。
- 微信模拟器自动返回未通过：从个人资料调用返回和切换标签后，自动化读取的页面仍未切回“我的”；本轮未修改该导航逻辑。金额与独立尾部检查结果分开保留，主流程记录 `passed:false`，不宣称整套原生流程通过。真实返回手势仍待补测，相关个人资料返回逻辑的隔离回归通过。
- 限制：真机iOS／Android、系统字体设置及横向手势滚动尚待实测；1.3倍文字与短屏为离线模拟。首次尝试通用 `frontend.test.cjs` 全量运行时，已有照片选择／裁剪／保存流程出现3项失败且未结束，已停止；这部分未作修改，也不计入本轮通过项，不宣称全量前端回归通过。

## 截图

| 场景 | 微信模拟器 | 离线适配 |
| --- | --- | --- |
| 完整月报预览金额 | [13,547.00](images/summary-amount-20261012/preview-native.png) | [390px](images/summary-amount-20261012/insights-normal-390.png) · [320px大字体](images/summary-amount-20261012/insights-normal-320-large.png) |
| 超长月报金额 | [整行](images/summary-amount-20261012/preview-large-native.png) · [横向查看](images/summary-amount-20261012/preview-extreme-native.png) | [极端值](images/summary-amount-20261012/insights-extreme-390.png) |
| 个人概览与分区 | [页面](images/summary-amount-20261012/me-native.png) | [390px](images/summary-amount-20261012/me-normal-390.png) · [320px大字体](images/summary-amount-20261012/me-normal-320-large.png) · [平板](images/summary-amount-20261012/me-normal-768.png) |
| 精确金额弹窗 | [弹窗](images/summary-amount-20261012/amount-dialog-native.png) | [普通](images/summary-amount-20261012/me-modal-390.png) · [极端值](images/summary-amount-20261012/me-modal-extreme-390.png) |
| 个人极端金额 | [整行查看](images/summary-amount-20261012/me-extreme-native.png) | [320px大字体](images/summary-amount-20261012/me-extreme-320-large.png) |
| 退出按钮 | [底部](images/summary-amount-20261012/footer-native.png) | [底部无遮挡](images/summary-amount-20261012/me-footer-390.png) |

## 复查

```text
node --test wechat/tests/summary-amount.test.cjs wechat/tests/navigation-discovery.test.cjs wechat/tests/monthly-balance.test.cjs wechat/tests/monthly-report.test.cjs wechat/tests/monthly-share.test.cjs
node --test --test-name-pattern="Me|profile|white theme" wechat/tests/frontend.test.cjs
node wechat/tools/verify-summary-amount.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File wechat/tools/verify-summary-amount-native.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File wechat/tools/verify-summary-amount-native.ps1 -TailOnly
```

## 后续视觉调整

上述分隔线方案已由用户选择的奶黄背景与玻璃概览替代，当前效果和验证见 [后续记录](me-glass-20261012.md)。本记录中的分隔截图为当时版本。

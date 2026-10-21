# 猫爪会员：按已认可草图还原

本次仅调整“我的”会员入口和订阅页的展示层；已有会员功能、后端接口、权限校验与数据处理保持原有行为。没有接入支付或部署正式环境。

视觉基准是最初认可的两屏草图，已保存为 [reference.png](images/membership-sketch-20261015/reference.png)。还原了浅奶黄色顶部、票券猫插画、黄色票券入口、三张套餐卡、粉色年卡标签、四款权益插画、薄荷绿色免费说明及黄色订阅按钮。默认390宽度对照；小屏及大字号允许必要换行。

底部按钮保持黄色但不可付款，文案为“订阅即将开放”；真实账户的昵称、头像、统计与会员状态继续使用实际数据，因此与草图中的示例数值不同。微信原生状态栏、胶囊及返回按钮由运行环境控制。

## 素材

票券猫通过内置 imagegen 参照原草图制作透明插画；提示词与来源见 [asset-provenance.json](images/membership-sketch-20261015/asset-provenance.json)。小图标保留草图原画，包装时仅去除与边缘相连的纸色背景，保留猫脸、书页内的白色填充。素材随包保存于 `miniprogram/assets/membership`。

## 验收材料

- [订阅页原图与微信实际截图对照](images/membership-sketch-20261015/subscription-comparison.png)
- [我的入口原图与微信实际截图对照](images/membership-sketch-20261015/entry-comparison.png)
- [多尺寸布局与报告检查](images/membership-sketch-20261015/layout-results.json)：免费、有效、到期、我的入口及五组会员工具，320／390／430／768宽度与320大字号，共49组。
- [微信编译检查](images/membership-sketch-20261015/compile-results.json)、[微信交互检查](images/membership-sketch-20261015/native-results.json)、[包体积与引用检查](images/membership-sketch-20261015/package-results.json)。
- 现有前端测试297项通过；本次未修改后端，未重复运行后端测试。截图与交互使用隔离数据，未进行真机测试。

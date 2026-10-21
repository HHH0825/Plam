# 小程序头像：小猫物品档案 v2

2026-10-07，按用户参考截图的小猫插画方向，用内置 image_gen 生成。主题是奶油色小猫拿猫爪档案本记录物品，搭配水杯；不含文字。

- `source.png`：生成原图。
- `avatar-1024.png`：1024×1024 高清版。
- `avatar-512.png`：512×512 推荐头像上传版，PNG／RGB，503337 字节。
- [圆形裁切预览](../../docs/images/kitten-avatar-v2-circle-preview.png)：实际检查猫脸、猫耳及档案本主要内容可见，杯子外侧装饰有少量裁切。

头像素材保存在小程序运行包目录之外，供微信后台手工上传使用。尚未在后台替换头像；旧候选图保留。

## 生成提示词

```text
Use case: logo-brand. Create one finished square 1024x1024 illustrated avatar icon for a Chinese WeChat mini program about recording and cherishing personal belongings, named 猫爪物帐 (DO NOT put any text in the image). Style: cute hand-painted sticker illustration, warm cream-white kitten with soft peach/orange patches on ears and head, fluffy rounded cheeks, very large friendly deep brown eyes, tiny pink nose, subtle rosy cheeks; charming cozy journal illustration similar to a cream kitten collecting keepsakes, with fine warm-brown outlines and gentle watercolor/gouache texture, pastel dusty blue, sage green, apricot and ivory palette. Subject: one clearly recognizable kitten shown from upper body, sitting behind and gently holding a small open sage-green belongings archive notebook with a single pawprint on its cover, one visible paw writing with a pencil; beside the notebook ONE small ivory mug to communicate personal objects. Kitten head and facial expression dominate, roughly 60 percent of the composition. The pose communicates a little custodian carefully recording belongings. Composition: centered, strong simple silhouette, tasteful minimal detail, readable at tiny 48px avatar size. Entire ears, paws, notebook and mug fit comfortably in central 78 percent of the square, safe for a circular avatar crop. Background: uniform warm ivory, faint soft pale sage circular glow behind the kitten, fully opaque, seamless to all square edges. Render the actual avatar artwork filling the square, no screen, no webpage, no device frame, no presentation mockup, no multiple options, no collage, no words or letters, no watermarks, no heavy black border, no photorealism, no 3D plastic, no excessively busy accessories. Beautiful polished small-app mascot icon, a fresh design distinct from a plain geometric book logo.
```

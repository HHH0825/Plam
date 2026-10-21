# 登录首页素材来源

模式：内置 image_gen，引用确认草图进行透明素材拆分；未使用 CLI/API 回退。

最终参考：`approved-sketch.png`。最终生成源文件：`hero-source.png`、`title-source.png`。运行导出：`../../miniprogram/assets/welcome-collection/`；体积详见 `runtime-manifest.json`。

小图标和装饰为项目原创 SVG，保存在本目录，由 `../../tools/prepare-welcome-art.cjs` 导出透明 PNG。按钮、示例内容和标签均用原生布局与文字实现。没有将整张参考图装入页面。

## 主插画最终提示词

Use case: background-extraction. Asset type: transparent hero illustration for the existing Chinese WeChat miniapp. Input image is the approved edit target. Extract ONLY the main central illustration: the smiling white kitten putting the grey camera into the yellow collection box, pink paw emblem on the box, white/pink paw at right lip, white cup with yellow flower on lower left, pink book on lower right, surrounding yellow stars/pink dots, and the upper-right taped square note saying exactly 慢慢用，好好记。 Preserve the original shapes, facial expression, pose, relative placement, hand-drawn dark charcoal outlines, pure white cat body, yellow and pale pink colors and original composition as closely as possible. The cat, box and note remain exactly the design shown, do not redesign. Remove all other UI content: brand, titles, example card, button, and phone chrome. Output one landscape illustration tightly fitted with a small transparent margin, on actual alpha transparency. White body and cup must remain opaque white. Do not add checkerboard texture, paper texture, shadows outside the original small grounding line, or new text or objects.

## 手绘标题最终提示词

Use case: background-extraction. Asset type: transparent hand-drawn Chinese headline for a miniapp. Input image is the edit target. Extract ONLY the two-line large black handwritten headline, the small pale pink paw to the right of the first line, and yellow underline under the second line. Keep exactly the letterforms, strokes, weight, spacing and composition from the reference. Exact text is 每件小物， on the first line and 都有自己的故事。 on second. Remove all other UI, branding, subtitle, cat and illustration, card and buttons. Crop tightly around this heading as one wide graphic, ratio about 3.1:1, on actual alpha-transparent background. Do not redesign or retype as generic sans-serif; preserve the warm irregular calligraphy of the original. No paper texture, no phone chrome, no extra text. Output black calligraphic Chinese text with the original pink paw and yellow underline only.

## 选择与核验

主插画首次输出的透明区域在预览器中显示了隐藏 RGB 的光晕；对照白底导出后，确认 alpha 为透明，实际白底无光晕，因此选用首次输出。后续尝试加深了装饰描边，未采用、未放入运行包。最终标题和主插画均保留原生透明通道，仅做尺寸与调色板压缩。

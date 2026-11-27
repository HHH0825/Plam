import { defineConfig } from '@tarojs/cli'

export default defineConfig({
  projectName: 'catpaw-storage-react-pilot',
  designWidth: 750,
  sourceRoot: 'src',
  outputRoot: process.env.NODE_ENV === 'development' ? 'dist/weapp-watch' : 'dist/weapp',
  framework: 'react',
  compiler: 'webpack5',
  mini: {
    postcss: {
      pxtransform: { enable: false },
      url: { enable: false },
    },
  },
})

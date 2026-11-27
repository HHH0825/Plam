import { View } from '@tarojs/components'
import { parseModel, type StorageLocationsProps } from '../../contracts/storage-locations'
import { StorageLocationsView } from './StorageLocationsView'
import './index.css'

export default function StorageLocations(props: StorageLocationsProps) {
  const model = parseModel(props.model)
  if (!model || typeof props.onIntent !== 'function') {
    return <View className='sl-message' ariaRole='alert'>收纳位置暂时无法显示，请返回后重新打开。</View>
  }
  return <StorageLocationsView model={model} onIntent={props.onIntent} />
}

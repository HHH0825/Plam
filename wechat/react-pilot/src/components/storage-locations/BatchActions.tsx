import { Button, View } from '@tarojs/components'
import type { IntentAction, StorageLocationsModel } from '../../contracts/storage-locations'

type Props = Pick<StorageLocationsModel, 'picking' | 'selecting' | 'chosenCount' | 'busy' | 'conflict'>
  & { emit: (action: IntentAction) => void }

export function BatchActions({ picking, selecting, chosenCount, busy, conflict, emit }: Props) {
  if (!selecting) return null
  const disabled = !chosenCount || busy || conflict
  return <View className='sl-actions sl-batch'>
    {picking ? <Button className='sl-button' disabled={disabled}
      onClick={() => emit({ type: 'add-selected' })}>放到这里（{chosenCount}）</Button> : <>
      <Button className='sl-button' disabled={disabled} onClick={() => emit({ type: 'choose-target' })}>移动位置</Button>
      <Button className='sl-button sl-light' disabled={disabled} onClick={() => emit({ type: 'clear-selected' })}>清除位置</Button>
    </>}
  </View>
}

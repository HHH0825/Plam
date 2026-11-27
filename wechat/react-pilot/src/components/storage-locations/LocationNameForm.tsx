import { Button, Input, Text, View } from '@tarojs/components'
import type { IntentAction, StorageLocationsModel } from '../../contracts/storage-locations'

type Props = Pick<StorageLocationsModel, 'renameId' | 'nameDraft' | 'busy'>
  & { emit: (action: IntentAction) => void }

export function LocationNameForm({ renameId, nameDraft, busy, emit }: Props) {
  return <View className='sl-form'>
    <Text className='sl-section-title'>{renameId === null ? '新增位置' : '修改位置名称'}</Text>
    <Input id='sl-name' className='sl-search' value={nameDraft} maxlength={40} disabled={busy}
      placeholder='例如：书桌抽屉、衣柜上层' ariaLabel='位置名称'
      onInput={e => emit({ type: 'edit-name', value: e.detail.value })} />
    <View className='sl-actions'>
      <Button className='sl-button' disabled={busy} onClick={() => emit({ type: 'save-name' })}>保存位置</Button>
      <Button className='sl-button sl-light' disabled={busy} onClick={() => emit({ type: 'cancel-name' })}>取消</Button>
    </View>
  </View>
}

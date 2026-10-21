"""Real responses from a temporary local database, never a production account."""
import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'backend'))
from palm import create_app, initialize_app, rewards
from palm.database import get_db
from flask import g

with tempfile.TemporaryDirectory(dir=root.parent/'test-results',prefix='growth-fixture-') as folder:
    app=initialize_app(create_app({'TESTING':True,'DATABASE':str(Path(folder)/'fixture.db'),'PHOTO_DIR':str(Path(folder)/'photos'),'WECHAT_CODE_EXCHANGER':lambda code:'offline-'+code}))
    client=app.test_client();user=client.post('/api/mp/auth/login',json={'code':'preview'}).json
    headers={'Authorization':'Bearer '+user['token']};counter=0
    def post(path,data):
        global counter
        counter+=1
        response=client.post('/api/mp'+path,json=data,headers={**headers,'Idempotency-Key':f'growth-fixture-{counter:08d}'})
        assert response.status_code<400,response.json
        return response.json
    for day in range(12,17):
        with patch('palm.rewards.clock',return_value=datetime(2026,10,day,10,tzinfo=rewards.TZ)):
            post('/rewards/checkin',{'date':f'2026-10-{day}'})
    with app.app_context():
        g.user_id=user['user']['id']
        rewards.write('wallet',{**rewards.wallet(),'balance':120,'used':20})
        rewards.write('growth',{'visits':7,'items':20,'ledger':5,'ledger_current':5,'claimed':['visits_3'],'version':1})
        get_db().commit()
    post('/rewards/invitation',{})
    with patch('palm.rewards.clock',return_value=datetime(2026,10,17,19,tzinfo=rewards.TZ)):
        state=client.get('/api/mp/rewards',headers=headers).json
        membership=client.get('/api/mp/membership?platform=android',headers=headers).json
    base=json.loads((root.parent/'test-results/rewards-fixture.json').read_text(encoding='utf-8'))['responses']
    base['/rewards']=state;base['/membership']={**membership,'supported':True}
    base['/auth/me']['user']['username']='成长册验收猫咪'
    target=root.parent/'test-results/growth-fixture.json'
    target.write_text(json.dumps({'responses':base},ensure_ascii=False,indent=2),encoding='utf-8')
    print(str(target))

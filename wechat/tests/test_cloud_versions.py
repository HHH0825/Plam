"""Real route preconditions, receipt replay and races; no cloud calls."""
import io
from unittest.mock import patch
from PIL import Image
from test_cloud_backend import CloudBackendTest


class VersionChecks(CloudBackendTest):
    def explicit(self, method, path, token, revision=None, data=None, key='version-request-000001'):
        headers = {'Authorization': 'Bearer ' + token, 'X-Palm-Bridge': 'b' * 48, 'Idempotency-Key': key}
        if revision is not None: headers['If-Match'] = f'"{revision}"'
        return self.client.open('/api/mp' + path, method=method, json=data, headers=headers)

    def test_stale_write_missing_header_owner_first_and_receipt_replay(self):
        a, b = self.login('va')['token'], self.login('vb')['token']
        item = self.item(a); path = '/items/' + str(item['id'])
        body = {k:item[k] for k in ('name','category','icon_type','purchase_date','purchase_price','notes','status')}
        body['name'] = 'newer'
        first = self.explicit('PUT', path, a, 0, body)
        self.assertEqual(first.status_code, 200); self.assertEqual(first.json['revision'], 1)
        self.assertEqual(self.explicit('PUT', path, a, 0, body).json, first.json)
        self.assertEqual(self.explicit('PUT', path, a, 1, body).status_code, 409)
        stale = self.explicit('PUT', path, a, 0, {**body,'name':'old'}, key='stale-new-request-0001')
        self.assertEqual(stale.json['code'], 'ITEM_VERSION_CONFLICT')
        self.assertFalse(stale.json['retry_same_request'])
        self.assertEqual(self.call('GET', path, a).json['name'], 'newer')
        self.assertEqual(self.explicit('DELETE', path, a, key='missing-version-0001').status_code, 428)
        self.assertEqual(self.explicit('DELETE', path, b, key='foreign-version-0001').status_code, 404)

    def test_legacy_revision_and_child_trash_guards(self):
        a = self.login('legacy-version')['token']; item = self.item(a); item_id = item['id']
        self.db.rows[('palm_items',str(item_id))].pop('revision')
        path = '/items/' + str(item_id)
        self.assertEqual(self.call('GET', path, a).json['revision'], 0)
        record = self.explicit('POST', path+'/maintenance', a, 0,
            {'maintained_on':'2025-02-01','cost':'1.00','description':'test'})
        self.assertEqual(record.status_code, 201)
        self.assertEqual(self.explicit('DELETE','/maintenance/'+str(record.json['id']),a,0,key='stale-child-0000001').status_code,409)
        self.assertEqual(self.explicit('DELETE',path,a,1,key='trash-delete-000001').status_code,204)
        trash = self.call('GET','/trash',a).json[0]
        self.assertEqual(trash['revision'],2)
        self.assertEqual(self.explicit('POST','/trash/'+str(item_id)+'/restore',a,1,key='stale-restore-00001').status_code,409)

    def test_ticket_staleness_stops_before_download_and_race_queues_orphans(self):
        a = self.login('ticket-version')['token']; item = self.item(a); path = '/items/'+str(item['id'])
        raw = io.BytesIO(); Image.new('RGB',(32,32),'red').save(raw,'PNG')
        ticket = self.explicit('POST',path+'/photo/uploads',a,0,{'size_bytes':len(raw.getvalue()),'content_type':'image/png'}).json['ticket']
        self.storage.objects[self.db.get('palm_photo_uploads',ticket)['object_id']] = raw.getvalue()
        commit = path+'/photo/uploads/'+ticket+'/commit'
        with patch.object(self.storage,'download',side_effect=AssertionError('Stale ticket downloaded')):
            self.explicit('PUT',path+'/pin',a,0,{'is_pinned':True},key='ticket-race-pin-0001')
            self.assertEqual(self.explicit('POST',commit,a,0,{},key='ticket-stale-commit1').status_code,409)
            self.assertEqual(self.explicit('POST',commit,a,1,{},key='ticket-rebased-commit').status_code,409)
        # A new valid ticket can become stale during IO. It must not publish its files.
        ticket = self.explicit('POST',path+'/photo/uploads',a,1,{'size_bytes':len(raw.getvalue()),'content_type':'image/png'},key='second-photo-ticket1').json['ticket']
        self.storage.objects[self.db.get('palm_photo_uploads',ticket)['object_id']] = raw.getvalue()
        upload = self.storage.upload
        def race(name, data):
            upload(name,data)
            self.db.rows[('palm_items',str(item['id']))]['revision'] = 2
        with patch.object(self.storage,'upload',side_effect=race):
            result = self.explicit('POST',path+'/photo/uploads/'+ticket+'/commit',a,1,{},key='photo-io-race-000001')
        self.assertEqual(result.status_code,409)
        self.assertIsNone(self.db.get('palm_items',item['id'])['photo_key'])
        objects = list(self.storage.objects)
        queued = {r['object_id'] for (name,_),r in self.db.rows.items() if name=='palm_storage_gc'}
        self.assertTrue(all(name in queued for name in objects))

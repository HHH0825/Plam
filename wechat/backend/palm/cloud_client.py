"""Production document transport. EJSON integers and bounded keyset pagination."""
import json
from cloudbase_probe.client import Client, Configuration, CloudBaseError


def encode(value):
    if isinstance(value, bool) or value is None: return value
    if isinstance(value, int): return {'$numberLong': str(value)}
    if isinstance(value, list): return [encode(v) for v in value]
    if isinstance(value, dict): return {k: encode(v) for k, v in value.items()}
    return value


def decode(value):
    if isinstance(value, list): return [decode(v) for v in value]
    if isinstance(value, dict):
        if len(value) == 1 and ('$numberInt' in value or '$numberLong' in value):
            return int(next(iter(value.values())))
        return {k: decode(v) for k, v in value.items()}
    return value


class DocumentClient(Client):
    def _request(self, *args, **kwargs):
        from .payment_budget import remaining
        remaining()
        result = super()._request(*args, **kwargs)
        remaining()
        return result

    def request_timeout(self):
        from .payment_budget import remaining
        return remaining(self.timeout)

    def read_response(self, response, limit):
        from .payment_budget import read_response
        return read_response(response, limit, self.timeout)

    def get(self, collection, doc_id, transaction_id=None):
        return decode(super().get(collection, str(doc_id), transaction_id))

    def insert(self, collection, documents, transaction_id=None):
        return super().insert(collection, encode(documents), transaction_id)

    def update(self, collection, doc_id, values, transaction_id=None):
        return super().update(collection, str(doc_id), encode(values), transaction_id)

    def delete(self, collection, doc_id, transaction_id=None):
        try:
            result = self._request('DELETE', self._documents(collection, str(doc_id)),
                                   query={'transactionId': transaction_id} if transaction_id else None)
        except CloudBaseError as error:
            if error.status == 404 and error.code == 'DOCUMENT_NOT_FOUND': return
            raise
        if result.get('deleted') != 1: raise CloudBaseError(200, 'INVALID_DELETE_RESPONSE')

    def page(self, collection, conditions=None, transaction_id=None, limit=100, after=None):
        query = conditions or {}
        if after is not None: query = {'$and': [query, {'_id': {'$gt': after}}]}
        params = {'query': json.dumps(encode(query)), 'limit': limit,
                  'order': json.dumps([{'field': '_id', 'direction': 'asc'}])}
        if transaction_id: params['transactionId'] = transaction_id
        result = self._request('GET', self._documents(collection), query=params)
        rows = decode(result.get('list'))
        if not isinstance(rows, list) or any(not isinstance(r, dict) or not isinstance(r.get('_id'), str) for r in rows):
            raise CloudBaseError(200, 'INVALID_QUERY_RESPONSE')
        return rows

    def query(self, collection, conditions=None, transaction_id=None):
        rows, after = [], None
        while True:
            page = self.page(collection, conditions, transaction_id, after=after)
            rows.extend(page)
            if len(page) < 100: return rows
            next_id = page[-1]['_id']
            if after is not None and next_id <= after: raise CloudBaseError(200, 'INVALID_PAGE_ORDER')
            after = next_id

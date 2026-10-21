"""Production entry point: fail closed when cloud configuration is missing."""
import os

if os.environ.get('PALM_STORAGE_BACKEND') != 'cloudbase':
    raise RuntimeError('palm-api requires PALM_STORAGE_BACKEND=cloudbase')

from palm import create_app, initialize_app
app = initialize_app(create_app())

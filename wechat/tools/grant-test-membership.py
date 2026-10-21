"""Offline local SQLite fixture tool. No public endpoint and no cloud credentials."""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from palm import create_app
from palm.database import get_db
from palm.membership import grant_test_membership

parser = argparse.ArgumentParser(description='仅向本地开发数据库授予测试猫爪会员')
parser.add_argument('--database', required=True, type=Path)
parser.add_argument('--user-id', required=True, type=int)
parser.add_argument('--status', choices=['active', 'expired', 'expiring'], default='active')
parser.add_argument('--months', choices=[1, 3, 12], default=12, type=int)
args = parser.parse_args()
if os.getenv('PALM_WECHAT_DEV_LOGIN') != '1' or os.getenv('PALM_STORAGE_BACKEND', 'sqlite') != 'sqlite':
    parser.error('请在本地开发环境设置 PALM_WECHAT_DEV_LOGIN=1、PALM_STORAGE_BACKEND=sqlite；云环境禁止使用')
if not args.database.is_file():
    parser.error('数据库不存在，请先启动本地开发服务并登录创建用户')
app = create_app({'DATABASE': str(args.database.resolve()), 'STORAGE_BACKEND': 'sqlite', 'DEV_LOGIN': True})
with app.app_context():
    db = get_db()
    db.execute('BEGIN IMMEDIATE')
    try:
        grant_test_membership(args.user_id, args.status, args.months)
        db.commit()
    except Exception:
        db.rollback()
        raise
print('本地测试会员已设置；请重新打开会员页面刷新。')

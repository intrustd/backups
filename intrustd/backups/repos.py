import json
import os.path
from uuid import UUID
from enum import Enum, unique

from borg.repository import Repository as BorgRepository

from .errors import InvalidEnum

@unique
class BackupType(Enum):
    DESKTOP = 'desktop'
    IPHONE = 'ios'
    ANDROID = 'android'

class Repository(object):
    def __init__(self, repo_id, storage_quota=None):
        self.repo_id = repo_id
        self.path = get_repo_dir(repo_id)
        if not os.path.exists(self.path):
            os.makedirs(self.path)

        create = False
        storage_quota = None
        try:
            with open(self.intrustd_info_path, 'rt') as f:
                self.info = json.load(f)
        except FileNotFoundError:
            self.info = {}
            create = True

        self.repo = BorgRepository(self.path, create=True, exclusive=True,
                                   storage_quota=storage_quota)

    @property
    def intrustd_info_path(self):
        return os.path.join(self.path, 'intrustd.json')

    @property
    def exists(self):
        return os.path.exists(self.path) and os.path.exists(self.intrustd_info_path)

    @property
    def name(self):
        return self.info.get('name')

    @property
    def description(self):
        return self.info.get('description')

    @property
    def backup_type(self):
        r = self.info.get('backupType', BackupType.DESKTOP)
        if isinstance(r, BackupType):
            return r
        else:
            return BackupType(r)

    @name.setter
    def name(self, n):
        self.info['name'] = n

    @description.setter
    def description(self, d):
        self.info['description'] = d

    @backup_type.setter
    def backup_type(self, t):
        try:
            t = BackupType(t)
        except ValueError:
            raise InvalidEnum(Enum, t)

        self.info['backupType'] = t

    def create(self):
        self.repo.create(self.path)
        self.save()

    def save(self):
        with open(self.intrustd_info_path, 'wt') as f:
            json.dump(self.info_json(), f)

    def info_json(self):
        return { 'name': self.name,
                 'id': str(self.repo_id),
                 'description': self.description,
                 'backupType': self.backup_type.value }

    def claim(self, token):
        if 'token' not in self.info or \
           self.info['token'] != token:
            self.info['token'] = token
            self.save()

def get_repos_dir():
    return os.getenv('INTRUSTD_BACKUPS', '/intrustd/')

def get_repo_dir(repo_id):
    if not isinstance(repo_id, UUID):
        repo_id = UUID(repo_id)
    return os.path.join(get_repos_dir(), str(repo_id))

def get_repo_name(repo_id):
    try:
        with open(os.path.join(get_repo_dir(repo_id), 'name'), 'rt') as f:
            return f.read()

    except FileNotFoundError:
        return None

def list_repos():
    for d in os.listdir(get_repos_dir()):
        if os.path.isdir(d) and os.path.exists(os.path.join(d, 'intrustd.json')):
            try:
                yield Repository(os.path.basename(d))
            except json.decoder.JSONDecodeError:
                pass

def make_new_repository():
    raise NotImplemented

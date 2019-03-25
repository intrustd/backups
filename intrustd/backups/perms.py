from intrustd.permissions import Permissions

from .repos import get_repo_name

perms = Permissions('intrustd+perm://backups.intrustd.com')

AdminPerm = perms.permission('/admin')

class ImpliedByAdminPerm(object):
    def search(self, search):
        for _ in search.search(AdminPerm):
            search.satisfy()

@perms.permission('/meta')
class MetaPerm(ImpliedByAdminPerm):
    pass

@perms.permission('/browse')
class BrowseAllPerm(ImpliedByAdminPerm):
    pass

@perms.permission('/backup/<backup_id ~"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89aAbB][a-f0-9]{3}-[a-f0-9]{12}">')
class BackupPerm(ImpliedByAdminPerm):
    def __init__(self, backup_id):
        self.backup_id = backup_id

@perms.permission('/browse/<backup_id ~"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89aAbB][a-f0-9]{3}-[a-f0-9]{12}">')
class BrowsePerm(ImpliedByAdminPerm):
    def __init__(self, backup_id):
        self.backup_id = backup_id

@perms.description
def admin_descr(search):
    for p in search.search(AdminPerm):
        perms = set(search.search(MetaPerm))
        return [ { 'short': 'Administer all user backups' } ], perms | {p}

@perms.description
def meta_descr(search):
    for p in search.search(MetaPerm):
        return [ { 'short': 'View details of all backups' } ], [p]

@perms.description
def browse_descr(search):
    for p in search.search(BrowseAllPerm):
        perms = set(search.search(BrowsePerm))
        return [ { 'short': 'Browse all backups' } ], perms | {p}

    for p in search.search(BrowsePerm):
        perms = set(search.search(BrowsePerm))
        return [ { 'short': 'Browse some backups' } ], perms

@perms.description
def backup_descr(search):
    perms = set()
    desc = []

    for p in search.search(BackupPerm):
        name = get_repo_name(p.backup_id)
        if name is None:
            name = 'a new repository'

        desc.append({ 'short': 'Backup to {}'.format(name) })
        perms.add(p)

    return desc, perms

verify = perms.verify_cmd
if __name__ == "__main__":
    verify()

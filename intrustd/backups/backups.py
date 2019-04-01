from .errors import BorgError

from sqlalchemy import Column, Integer, String, DateTime, Enum as SqlEnum, \
    create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

from enum import Enum, unique
from contextlib import contextmanager

import os.path
import subprocess
import json
import select
import fcntl
import os
import uuid
import configparser

Base = declarative_base()

backup_id_length = len(str(uuid.UUID(int=0)))

@unique
class BackupType(Enum):
    DESKTOP = 'desktop'
    IPHONE = 'ios'
    ANDROID = 'android'

class Backup(Base):
    __tablename__ = 'backup'

    # Id is a UUID, in string format
    id = Column(String, primary_key=True)

    name = Column(String)
    description = Column(String, default="")
    backup_type = Column(SqlEnum(BackupType))

    cur_token = Column(String, nullable=True)

    def to_json(self):
        return { 'name': self.name,
                 'id': self.id,
                 'description': self.description,
                 'backupType': self.backup_type.value }

class Version(Base):
    __tablename__ = 'version'

    version = Column(Integer, primary_key=True)

def get_backups_dir(absolute=False):
    path = os.getenv("INTRUSTD_BACKUPS")

    if absolute:
        path = os.path.abspath(path)

    return path

def get_repo_dir():
    return os.path.join(get_backups_dir(absolute=True),
                        "repository")

engine = create_engine("sqlite:///" + os.path.join(get_backups_dir(absolute=True), "backups.db"))

Session = sessionmaker(bind=engine)

def do_migrate():
    latest_version = 1

    session = Session()
    connection = engine.connect()

    try:
        if not engine.dialect.has_table(engine, 'version'):
            connection.execute("CREATE TABLE version(version integer primary key)")

        res = list(session.query(Version).order_by(Version.version.desc()).limit(1))

        version = 0
        if len(res) > 0:
            version = res[0].version

        if version <= 0:
            connection.execute('''
              CREATE TABLE backup ( id VARCHAR PRIMARY KEY,
                                    name VARCHAR NOT NULL,
                                    description VARCHAR DEFAULT '' NOT NULL,
                                    backup_type VARCHAR NOT NULL,
                                    cur_token VARCHAR )
            ''')

        if version < latest_version:
            session.add(Version(version=latest_version))
        session.commit()

    finally:
        session.close()
        connection.close()

do_migrate()

def get_borg_exe():
    return os.getenv("BORG", "borg")

def get_borg_env():
    r = dict(os.environ)
    r.update(BORG_UNKNOWN_UNENCRYPTED_REPO_ACCESS_IS_OK='yes',
             BORG_RELOCATED_REPO_ACCESS_IS_OK='yes')

def do_create_repository():
    repo_dir = get_repo_dir()

    if not os.path.exists(repo_dir):
        if subprocess.call([get_borg_exe(), "init", repo_dir, "-e", "none"]) != 0:
            raise RuntimeError("Could not create borg archive")

    borg_config = os.path.join(repo_dir, "config")
    p = configparser.ConfigParser()
    p.read(borg_config)
    repo_id = p['repository']['id']

do_create_repository()

@contextmanager
def session_scope():
    session = Session()

    try:
        yield session
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()

def run_borg_simple(args):
    proc = subprocess.Popen([ get_borg_exe() ] + args, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, env=get_borg_env)

    stdout, stderr = proc.communicate()
    proc.wait()
    if proc.returncode != 0:
        print("Got error", stderr, proc.returncode)
        raise BorgError(stderr, args=args)

    return json.loads(stdout)

def list_archives(prefix=None):
    args = [ "list", "--log-json", "--json", get_repo_dir() ]
    if prefix is not None:
        args.extend(["--prefix", prefix])

    data = run_borg_simple(args)
    archives = data.get('archives', [])

    for archive in archives:

        del archive['barchive']
        archive['backup_id'] = archive['archive'][:backup_id_length]
        archive['name'] = archive['archive'][backup_id_length + 1:]
        del archive['archive']

    return archives

def get_archive(bkid, name):
    args = [ "info", "--log-json", "--json", "{}::{}".format(get_repo_dir(), name) ]

    data = run_borg_simple(args)
    archives = data.get('archives', [])

    if len(archives) == 0:
        return None

    res = archives[0]
    if 'cache' in data:
        res['cache'] = data['cache']
    res['encryption'] = data.get('encryption', {'mode': 'none'})

    res['name'] = res['name'][len(bkid)+1:]

    return res

def set_nonblock(f):
    fl = fcntl.fcntl(f.fileno(), fcntl.F_GETFL)
    fcntl.fcntl(f.fileno(), fcntl.F_SETFL, fl | os.O_NONBLOCK)

@contextmanager
def list_contents(archive, path):
    args = [ get_borg_exe(),
             "list", "--json-lines", "--log-json",
             "{}::{}".format(get_repo_dir(), archive) ]

    if path == "":
        args.extend(['-e', '*/*', '-e', '.'])
    else:
        args.extend([path, "-e", "{}/*/*".format(path) ])

    print("Args are ", args)
    try:
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=get_borg_env())

        stdout = proc.stdout
        stderr = proc.stderr

        set_nonblock(stdout)
        set_nonblock(stderr)

        yield continue_list_contents(args, proc, stdout, stderr)

    except:
        proc.kill()
        raise

def continue_list_contents(args, proc, stdout, stderr):
    cur_stdout_buf = ""
    cur_stderr_buf = ""

    while True:
        if proc.poll() is not None:
            break

        r = []
        if stdout is not None:
            r.append(stdout)
        if stderr is not None:
            r.append(stderr)

        if len(r) == 0:
            break

        has_r, has_w, has_x = select.select(r, [], r)

        if stdout in has_r:
            b = stdout.read(1024)
            if len(b) == 0:
                has_x.append(stdout)

            else:
                b = b.decode('utf-8')
                cur_stdout_buf += b
                while True:
                    ln_length = cur_stdout_buf.find('\n')
                    if ln_length == -1:
                        break

                    yield json.loads(cur_stdout_buf[:ln_length])
                    cur_stdout_buf = cur_stdout_buf[ln_length+1:]

        if stderr in has_r:
            b = stderr.read(1024)
            if len(b) == 0:
                has_x.append(stderr)

            else:
                b = b.decode('utf-8')
                cur_stderr_buf += b

        if stdout in has_x:
            stdout.close()
            stdout = None

        if stderr in has_x:
            stderr.close()
            stderr = None

    if len(cur_stdout_buf) > 0:
        yield json.loads(cur_stdout_buf)

    if len(cur_stderr_buf) > 0:
        print("Stderr:", cur_stderr_buf)

    if proc.returncode != 0:
        raise BorgError(cur_stderr_buf, args=args)


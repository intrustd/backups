from flask import jsonify, send_from_directory, send_file, request, abort, url_for
import uuid

from .app import app
from .perms import *
from .backups import BackupType, Backup, get_backups_dir, session_scope, \
    list_archives, get_archive, list_contents
from .errors import MissingKey

from intrustd.permissions import Placeholder, mkperm, mint_token

def no_cache(fn):
    def no_cache_wrapped(*args, **kwargs):
        r = app.make_response(fn(*args, **kwargs))
        if 'Cache-control' not in r.headers and \
           request.method == 'GET':
            r.headers['Cache-control'] = 'no-cache,no-store,must-revalidate'
        return r

    no_cache_wrapped.__name__ = fn.__name__
    return no_cache_wrapped

@app.route('/backups', methods=['GET', 'POST'])
@no_cache
def backups():
    if request.method == 'GET':
        with session_scope() as session:
            backups = [backup.to_json() for backup in session.query(Backup).all()]

            archives = list_archives()

            for bk in backups:
                archive_cnt = 0
                for ar in archives:
                    if ar.get('backup_id') == bk.get('id'):
                        archive_cnt += 1

                bk['archives'] = archive_cnt

            return jsonify(backups)
    elif request.method == 'POST':
        data = request.json

        if 'name' not in data:
            raise MissingKey(key='name')

        backup_id = uuid.uuid4()

        backup_id_str = str(backup_id)

        with session_scope() as session:
            ty = BackupType(data.get('backupType', 'desktop'))

            b = Backup(id=backup_id_str,
                       name=data['name'],
                       description=data.get('description', ''),
                       backup_type=ty)

#            token = mint_token(BrowsePerm(backup_id=backup_id_str).transfer,
#                               BackupPerm(backup_id=backup_id_str).transfer,
#                               MetaPerm,
#                               on_behalf_of=request.remote_addr)
#
#            b.cur_token = token
            token = "abcd"
            session.add(b)

        rsp = jsonify(token=token)
        rsp.status_code = 201
        rsp.headers['Location'] = \
            url_for('backup', backup_id=backup_id_str,
                    _scheme='intrustd+app',
                    _external=True)

        return rsp
    else:
        abort(405)

@app.route('/backups/<backup_id>', methods=['GET', 'PUT', 'DELETE'])
@perms.require({ 'GET': MetaPerm,
                 'PUT': AdminPerm,
                 'DELETE': AdminPerm })
def backup(backup_id=None, cur_perms=None):
    if backup_id is None:
        abort(404)

    with session_scope() as session:
        backup = session.query(Backup).get(backup_id)
        if backup is None:
            if request.method == 'DELETE':
                return jsonify({})
            else:
                abort(404)

        if request.method == 'GET':
            return jsonify(backup.to_json())

        elif request.method == 'PUT':
            abort(501) # TODO not implemented

        elif request.method == 'DELETE':
            archives = list_archives(prefix=backup_id)
            delete_archives(archives)

            session.delete(backup) # TODO invalidate all tokens

            return jsonify({})

        else:
            abort(405)

@app.route('/backups/<backup_id>/archives', methods=['GET'])
@perms.require({ 'GET': mkperm(BrowsePerm, backup_id=Placeholder('backup_id')) })
def archives(backup_id=None, cur_perms=None):
    if backup_id is None:
        abort(404)

    with session_scope() as session:
        backup = session.query(Backup).get(backup_id)
        if backup is None:
            abort(404)

    return jsonify(list_archives(prefix=backup_id))

@app.route('/backups/<backup_id>/archives/<archive_name>', methods=['GET'])
@perms.require({ 'GET': mkperm(BrowsePerm, backup_id=Placeholder('backup_id')) })
def archive(backup_id=None, archive_name=None, cur_perms=None):
    if backup_id is None or archive_name is None:
        abort(404)

    if archive_name == 'latest':
        archives = list_archives(prefix=backup_id)
        if len(archives) == 0:
            abort(404)

        archive_name = archives[-1].get('archive')
    else:
        archive_name = "{}-{}".format(backup_id, archive_name)

    with session_scope() as session:
        backup = session.query(Backup).get(backup_id)
        if backup is None:
            abort(404)

    archive = get_archive(backup_id, archive_name)
    if archive is None:
        abort(404)

    return jsonify(archive)

@app.route('/backups/<backup_id>/archives/<archive_name>/contents/', defaults={'path': ''}, methods=['GET'])
@app.route('/backups/<backup_id>/archives/<archive_name>/contents/<path:path>', methods=['GET'])
def archive_contents(backup_id=None, archive_name=None, path=None):
    if backup_id is None or archive_name is None or path is None:
        abort(404)

    with session_scope() as session:
        backup = session.query(Backup).get(backup_id)
        if backup is None:
            abort(404)

    limit = request.args.get('limit', 100)
    try:
        limit = int(limit)
    except ValueError:
        raise(400)

    offset = request.args.get('offset', 0)
    try:
        offset = int(offset)
    except ValueError:
        raise(400)

    res = []
    with list_contents("{}-{}".format(backup_id, archive_name), path) as contents:
        for info in contents:
            if (path == '' and info.get('path') == '.') or \
               info.get('path') == path:
                continue

            if offset == 0:
                if limit == 0:
                    break
                else:
                    limit -= 1
                    res.append(info)
            else:
                offset -= 1

    return jsonify(res)

def main(debug=False, port=80):
    print("Starting server")

    if debug:
        perms.debug = True

    app.run(host='0.0.0.0', port=port)

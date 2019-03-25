from flask import jsonify, send_from_directory, send_file, request, abort, url_for
import uuid

from .app import app
from .perms import *
from .repos import Repository, list_repos
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

@app.route('/repos', methods=['GET', 'POST'])
@no_cache
def repos():
    if request.method == 'GET':
        return jsonify([r.info_json() for r in list_repos()])
    elif request.method == 'POST':
        data = request.json

        if 'name' not in data:
            raise MissingKey(key='name')

        repo = Repository(uuid.uuid4())
        repo.name = data['name']
        if 'description' in data:
            repo.description = data['description']
        if 'backupType' in data:
            repo.backup_type = data['backupType']

        repo.create()

        token = mint_token(BrowsePerm(backup_id=str(repo.repo_id)).transfer,
                           BackupPerm(backup_id=str(repo.repo_id)).transfer,
                           MetaPerm,
                           on_behalf_of=request.remote_addr)

        repo.claim(token) # The token allowed to claim this repository

        status = repo.info_json()
        status['token'] = token

        rsp = jsonify(token=token)
        rsp.status_code = 201
        rsp.headers['Location'] = \
            url_for('repo', repo_id=str(repo.repo_id),
                    _scheme='intrustd+app',
                    _external=True)

        return rsp
    else:
        abort(405)

@app.route('/repo/<repo_id>', methods=['GET', 'PUT', 'DELETE'])
@perms.require({ 'GET': MetaPerm,
                 'PUT': AdminPerm,
                 'DELETE': AdminPerm })
def repo(repo_id=None):
    if repo_id is None:
        abort(404)

    if request.method == 'GET':
        r = Repository(uuid.UUID(repo_id))
        if not r.exists:
            abort(404)
        return jsonify(r.info_json())

    elif request.method == 'PUT':
        abort(501) # TODO not implemented

    elif request.method == 'DELETE':
        abort(501) # TODO not implemented

    else:
        abort(405)



def main(debug=False, port=80):
    print("Starting server")

    if debug:
        perms.debug = True

    app.run(host='0.0.0.0', port=port)

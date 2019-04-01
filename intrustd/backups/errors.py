from flask import jsonify, request, redirect

from .app import app

class MissingKey(Exception):
    def __init__(self, path=None, key=None):
        if path is None or key is None:
            raise TypeError('Both path and key arguments should be set')

        self.path = path
        self.key = key

    def to_dict(self):
        return { 'error': 'Missing key {}'.format(self.key),
                 'type': 'missing',
                 'key': self.key,
                 'path': self.path }

@app.errorhandler(MissingKey)
def missing_key(error):
    response = jsonify(error.to_dict())
    response.status_code = 400
    return response

class InvalidEnum(Exception):
    def __init__(self, enum, value):
        self.enum = enum
        self.value = value

    def to_dict(self):
        return { 'error': 'Invalid enum value {} for type {}'.format(self.value, self.enum.__name__),
                 'type': 'invalid-enum',
                 'value': self.value,
                 'forType': self.enum.__name__ }

@app.errorhandler(InvalidEnum)
def invalid_enum(error):
    response = jsonify(error.to_dict())
    response.status_code = 400
    return response

class BorgError(Exception):
    def __init__(self, msgs, args=None):
        self.args = args
        if isinstance(msgs, bytes):
            self.msg_text = msgs.decode('utf-8')
        else:
            self.msg_text = msgs
        try:
            self.msgs = [json.loads(msg) for msg in self.msg_text.split('\n') if len(msg.strip()) > 0]
        except:
            self.msgs = []

    @property
    def is_archive_not_found(self):
        return self.has_log_message(["Archive.DoesNotExist"])

    @property
    def is_repo_not_found(self):
        return self.has_log_message(["Repository.DoesNotExist"])

    @property
    def is_not_found(self):
        return self.has_log_message(set(["Archive.DoesNotExist",
                                         "Repository.DoesNotExist"]))

    def has_log_message(self, msgty):
        return any(msg.get('msgid') in msgty\
                   for msg in self.msgs \
                   if msg.get('type') == 'log_message')

    @property
    def response(self):
        if self.is_not_found:
            response = jsonify({'status': 'Not Found'})
            response.status_code = 404
            return response
        else:
            response = jsonify({'status': 'Internal Error',
                                'messages': self.msgs,
                                'text': self.msg_text})
            response.status_code = 500
            return response

@app.errorhandler(BorgError)
def borg_error(error):
    return error.response

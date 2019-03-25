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

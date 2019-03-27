import { install, mintToken, addTokens } from 'intrustd';
import { LoadingIndicator } from 'intrustd/src/react.js';

install({permissions: [ "intrustd+perm://backups.intrustd.com/admin",
                        "intrustd+perm://backups.intrustd.com/admin/transfer",
                        "intrustd+perm://admin.intrustd.com/login/transfer",
                        "intrustd+perm://admin.intrustd.com/guest/transfer",
                        "intrustd+perm://admin.intrustd.com/site/transfer" ],
         appName: 'backups.intrustd.com',
         requiredVersion: '0.1.0' })

import react from 'react';
import ReactDom from 'react-dom';

import Button from 'react-bootstrap/Button';
import ToggleButton from 'react-bootstrap/ToggleButton';
import Navbar from 'react-bootstrap/Navbar';
import Form from 'react-bootstrap/Form';
import FormControl from 'react-bootstrap/FormControl';
import Nav from 'react-bootstrap/Nav';
import Alert from 'react-bootstrap/Alert';
import InputGroup from 'react-bootstrap/InputGroup';
import Modal from 'react-bootstrap/Modal';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import ToggleButtonGroup from 'react-bootstrap/ToggleButtonGroup';
import ListGroup from 'react-bootstrap/ListGroup';

import 'bootstrap/scss/bootstrap.scss';
import 'font-awesome/scss/font-awesome.scss';

class BackupItem extends react.Component {
    render() {
        const E = react.createElement
        const backupTypeIcons = { ios: 'fa-mac', android: 'fa-android', desktop: 'fa-laptop' }
        var { name, description, backupType } = this.props.backup

        var backupTypeIcon = backupTypeIcons[backupType]
        if ( backupTypeIcon === undefined )
            backupTypeIcon = 'fa-laptop'

        return E(ListGroup.Item, { className: 'flex-row align-items-start' },
                 E('i', { className: 'fa fa-fw ${backupTypeIcon}' }),
                 E('div', { className: 'flex-column align-items-start d-flex w-100' },
                   E('h5', null, name),
                   description))
    }
}

class Backups extends react.Component {
    render() {
        const E = react.createElement
        if ( this.props.backups.length == 0 ) {
            return E(Alert, { variant: 'success' },
                     'No backups, click \'+\' above to create one')
        } else {
            return E(ListGroup, null,
                     this.props.backups.map((b) => E(BackupItem, {key: b.id, backup: b})))
        }
    }
}

class CreateBackupModal extends react.Component {
    constructor() {
        super()

        this.nameRef = react.createRef()
        this.descriptionRef = react.createRef()

        this.state = { backupType: 'desktop', loading: false }
    }

    doCreate() {
        var desc = { name: this.nameRef.current.value,
                     description: this.descriptionRef.current.value,
                     backupType: this.state.backupType }

        this.setState({loading: true})

        fetch('intrustd+app://backups.intrustd.com/repos',
              { method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(desc) })
            .then((r) => {
                if ( r.status == 201 ) {
                    r.json().then(
                        ({token}) =>
                            fetch(r.headers.get('location'))
                            .then((r) => {
                                if ( r.status == 200 )
                                    r.json().then((info) => this.props.onBackupCreated(Object.assign({token}, info)),
                                                  (e) => this.setState({loading: false, error: `Unknown status: ${r.status}`}))
                                else
                                    r.json().then(({error}) => this.setState({error}),
                                                  (e) => this.setState({loading: false, error: `Unknown status: ${r.status}`}))
                            }))
                } else {
                    r.json()
                        .then(({error}) => this.setState({loading: false, error}))
                        .catch((e) => this.setState({loading: false, error: `Unknown status: ${r.status}`}))
                }
            })
    }

    render() {
        const E = react.createElement

        var loadingIndicator, error

        if ( this.state.loading )
            loadingIndicator = E('div', { className: 'create-backup-loading-spinner', key: 'loading' },
                                 E('div', null, 'Creating backup...'),
                                 E(LoadingIndicator))

        if ( this.state.error )
            error = E(Alert, { variant: 'danger' },
                      this.state.error)

        return E(Modal, { show: true, onHide: this.props.onHide },
                 E(Modal.Header, { closeButton: true},
                   E(Modal.Title, null, "Create Backup")),

                 E(Modal.Body, null,
                   loadingIndicator, error,
                   E(Form.Group, { controlId: 'backupName', key: 'form' },
                     E(Form.Label, null, 'Name'),
                     E(Form.Control, { type: 'text', ref: this.nameRef }),
                     E(Form.Text, null, 'A name for this backup to help you identify it')),
                   E(Form.Group, { controlId: 'backupDescription' },
                     E(Form.Label, null, 'Description'),
                     E(Form.Control, { as: 'textarea', rows: 3, ref: this.descriptionRef  }),
                     E(Form.Text, null, 'Description of the machine backed up')),

                   E(ToggleButtonGroup, { 'aria-label': 'Backup Type', toggle: true,
                                          type: 'radio', name: 'backupType',
                                          value: this.state.backupType,
                                          onChange: (backupType) => this.setState({backupType})},
                     E(ToggleButton, { value: 'android' },
                       E('i', { className: 'fa fa-fw fa-3x fa-android' }),
                       E('div', null, 'Android')),
                     E(ToggleButton, { value: 'ios' },
                       E('i', { className: 'fa fa-fw fa-3x fa-apple' }),
                       E('div', null, 'iPhone/iPad')),
                     E(ToggleButton, { value: 'desktop' },
                       E('i', { className: 'fa fa-fw fa-3x fa-laptop' }),
                       E('div', null, 'PC/Mac')))),

                 E(Modal.Footer, null,
                   E(Button, { variant: 'secondary', onClick: this.props.onHide },
                     'Close'),
                   E(Button, { variant: 'primary', onClick: this.doCreate.bind(this) },
                     'Create')))
    }
}

class BackupsApp extends react.Component {
    constructor() {
        super()
        this.state = { createBackup: 0, showCreate: false }
    }

    componentDidMount() {
        this.refresh()
    }

    refresh() {
        console.log("Request to refresh backups")
        this.setState({backups: undefined})
        fetch('intrustd+app://backups.intrustd.com/repos')
            .then((r) => {
                console.log("Got response")
                if ( r.status == 200 )
                    r.json().then((backups) => { console.log("Got response " , backups); this.setState({backups}) })
                else
                    this.setState({error: `Unexpected status: ${r.status}`})
            })
    }

    doCreateBackup() {
        this.setState({createBackup: this.state.createBackup + 1,
                       showCreate: true})
    }

    onBackupCreated(info) {
        this.setState({showCreate: false});
        addTokens([info.token]).then(() => {
            mintToken([ 'intrustd+perm://admin.intrustd.com/login/transfer',
                        'intrustd+perm://admin.intrustd.com/login',
                        'intrustd+perm://backups.intrustd.com/meta/transfer',
                        'intrustd+perm://backups.intrustd.com/meta',
                        `intrustd+perm://backups.intrustd.com/browse/${info.id}`,
                        `intrustd+perm://backups.intrustd.com/browse/${info.id}/transfer`,
                        `intrustd+perm://backups.intrustd.com/backup/${info.id}`,
                        `intrustd+perm://backups.intrustd.com/backup/${info.id}/transfer` ],
                      { format: 'json', requiresPersona: true })
                .then((json)=> {
                    this.setState({newBackup: btoa(JSON.stringify(json))})
                })
        }, (e) => {
            this.setState({ globalError: 'Could not create token: ' + e.message })
        })
        this.refresh();
    }

    render() {
        const E = react.createElement;

        var backups, createBackupModal

        if ( this.state.error )
            backups = E(Alert, { variant: 'danger' },
                        this.state.error)
        else if ( this.state.backups === undefined )
            backups = E(LoadingIndicator)
        else
            backups = E(Backups, { backups: this.state.backups })

        if ( this.state.showCreate )
            createBackupModal = E(CreateBackupModal, { key: `create-backup-${this.state.createBackup}`,
                                                       onHide: () => this.setState({showCreate: false }),
                                                       onBackupCreated: this.onBackupCreated.bind(this) })

        var alert, message
        if ( this.state.globalError )
            alert = E(Alert, {variant: 'danger', dismissible: true,
                              onClose: () => this.setState({error: undefined})},
                      this.state.globalError)

        if ( this.state.newBackup )
            message = E(Alert, {variant: 'success', dismissible: true,
                                onClose: () => this.setState({message: undefined})},
                        E(Alert.Heading, null, 'Success!'),
                        E('p', null, 'Paste the code belowe in the Intrustd Backups desktop application to continue the process:'),
                        E('code', null, this.state.newBackup))

        return [
            E('div', { className: 'container' },
              alert,
              message,
              E(Navbar, { bg: 'light', expand: 'lg' },
                E(Navbar.Brand, { href: '#home'},
                  'Backups'),
                E(Form, { inline: true, className: 'mr-auto' },
                  E(InputGroup, null,
                    E(InputGroup.Prepend, E('i', { className: 'fa fa-fw fa-search' })),
                    E(FormControl, { placeholder: 'Search',
                                     'aria-label': 'Search backups' }))),
                E(Navbar.Toggle, { 'aria-controls': 'backups-navbar' }),
                E(Navbar.Collapse, { id: 'backups-navbar' },
                  E(Nav, null,
                    E(Nav.Link, { onClick: this.doCreateBackup.bind(this) },
                         E('i', { className: 'fa fa-fw fa-plus'}))))),

              backups),

            createBackupModal
        ];
    }
}

var container = document.createElement('div');
document.body.appendChild(container)
ReactDom.render(react.createElement(BackupsApp), container)

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
import moment from 'moment';

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
import Dropdown from 'react-bootstrap/Dropdown';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';
import Breadcrumb from 'react-bootstrap/Breadcrumb';

import 'bootstrap/scss/bootstrap.scss';
import 'font-awesome/scss/font-awesome.scss';

import './backups.svg';

import { HashRouter as Router,
         Route, Switch, withRouter,
         Link } from 'react-router-dom';

const E = react.createElement

class BackupItem extends react.Component {
    render() {
        const E = react.createElement
        const backupTypeIcons = { ios: 'fa-mac', android: 'fa-android', desktop: 'fa-laptop' }
        var { name, description, backupType, archives } = this.props.backup

        var backupTypeIcon = backupTypeIcons[backupType]
        if ( backupTypeIcon === undefined )
            backupTypeIcon = 'fa-laptop'

        var backups = E('i', null, 'No backups')
        if ( archives > 0 ) {
            backups = E('i', null, E(Link, { to: `/backups/${this.props.backup.id}` },
                                     `${archives} previous backup(s)`))
        }

        return E(ListGroup.Item, { className: 'flex-row align-items-start' },
                 E('i', { className: 'fa fa-fw ${backupTypeIcon}' }),
                 E('div', { className: 'flex-column align-items-start d-flex w-100' },
                   E('h5', null, name),
                   description,
                   backups))
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
                     this.props.backups.map((b) => E(BackupItem, {key: b.id, backup: b })))
        }
    }
}

class FileListing extends react.Component {
    constructor () {
        super()
        this.state = {}
    }

    render() {
        var l = this.props.file
        var className = "file", faIcon = "fa-page", nmTransform = (e) => e

        if ( this.fileName === undefined ) {
            if ( this.props.dir == '/' )
                this.fileName = l.path
            else
                this.fileName = l.path.substring(this.props.dir.length)
        }

        if ( l.type == 'd' ) {
            className = "directory"
            faIcon = "fa-folder"

            var match = this.props.match.params
            nmTransform = (e) => E(Link, { to: `/backups/${match.backupId}/${match.archiveName}/${l.path}` }, e)
        }

        return E('tr', { key: l.path,
                         className: `item item--${className}` },
                 E('td', { className: 'text-center' },
                   E('i', { className: `fa fa-fw ${faIcon}` })),
                 E('td', null, nmTransform(this.fileName)),
                 E('td', null, `${l.user}:${l.group}`),
                 E('td', null, moment.utc(l.mtime).fromNow()))
    }
}

const FileListingWithRouter = withRouter(FileListing)

class BackupTree extends react.Component {
    constructor () {
        super()
        this.state = { listing: null }
    }

    componentDidMount() {
        console.log("Get", `intrustd+app://backups.intrustd.com/backups/${this.props.backupId}/archives/${this.props.archiveName}/contents${this.props.path}`)
        fetch(`intrustd+app://backups.intrustd.com/backups/${this.props.backupId}/archives/${this.props.archiveName}/contents${this.props.path}`,
              { method: 'GET' })
            .then((r) => {
                if ( r.status == 200 )
                    r.json().then((listing) => { this.setState({listing}) },
                                  () => { this.setState({error: "Could not parse JSON"}) })
                else {
                    this.setState({error: `Invalid listing status: ${r.status}`})
                    r.text().then((c) => { this.setState({error: `Invalid listing status ${r.status}: ${c}`}) })
                }
            })
    }

    render() {
        if ( this.state.error ) {
            return E(Alert, { variant: 'danger' }, this.state.error)
        } else if ( this.state.listing ) {
            console.log("Got listing", this.state.listing)
            return E(Table, { className: 'backup-listing',
                              key: `${this.props.backupId}-${this.props.archiveName}-${this.props.path}` },
                     E('thead', null,
                       E('tr', null,
                         E('td', null),
                         E('td', null, 'Name'),
                         E('td', null, 'Owner'),
                         E('td', null, 'Modified'))),
                     E('tbody', null,
                       this.state.listing.map((l) => E(FileListingWithRouter, {file: l, key: l.path, dir: this.props.path }))))
        } else
            return E(LoadingIndicator)
    }
}

class Breadcrumbs extends react.Component {
    render() {
        var components = this.props.path.split('/')
        if ( this.props.path == '/' )
            components = [ '' ]

        return E(Breadcrumb, null,
                 components.map((c, index) => {
                     var active = index == components.length - 1;
                     var link = (e) => e
                     var curPath = components.slice(0, index + 1).join('/')
                     if ( !active ) {
                         console.log("components are ", index, components.slice(0, index))
                         link = (e) => E(Link, { to: `/backups/${this.props.backupId}/${this.props.archiveName}${curPath}` }, e)
                     }

                     if ( index == 0 ) {
                         return E(Breadcrumb.Item, { active, key: curPath },
                                  link(E('i', { className: 'fa fa-fw fa-home' })))
                     } else {
                         return E(Breadcrumb.Item, { active }, link(c))
                     }
                 }))
    }
}

class BackupBrowser extends react.Component {
    constructor() {
        super()
        this.state = { backup: null, archives: null, curArchive: null }
        this.needsArchive = false
    }

    componentDidMount() {
        fetch(`intrustd+app://backups.intrustd.com/backups/${this.props.backupId}`,
              { method: 'GET', cache: 'no-store' })
            .then((r) => {
                if ( r.status == 200 )
                    r.json().then((backup) => { this.setState({backup}) },
                                  () => { this.setState({error: "Could not parse JSON"}) })
                else
                    this.setState({error: `Invalid backup status: ${r.status}`})
            })
        this.doFetchArchives()
    }

    doFetchArchives() {
        fetch(`intrustd+app://backups.intrustd.com/backups/${this.props.backupId}/archives`,
              { method: 'GET', cache: 'no-store' })
            .then((r) => {
                if ( r.status == 200 )
                    r.json().then(
                        (archives) => {
                            archives.reverse()
                            var archiveMap = {}
                            archives.map((a) => { archiveMap[a.name] = a })
                            this.setState({archives, archiveMap})

                            console.log("Got archives", this.needsArchive)
                            if ( archives.length > 0 && this.needsArchive ) {
                                this.setArchive(archives[0])
                            }
                        },
                        () => { this.setState({error: "Could not parse JSON"}) })
                else
                    this.setState({error: `Invalid archives status: ${r.status}`})
            })
    }

    setArchive(ar) {
        this.props.history.push(`/backups/${this.props.backupId}/${ar.name}/`)
        this.setState({curArchive: ar})
    }

    render() {
        if ( this.state.error ) {
            return E(Alert, {variant: 'danger'}, this.state.error)
        } else if ( this.state.backup ) {
            var archives = E(LoadingIndicator)
            if ( this.state.archives )
                archives = this.state.archives.map(
                    (a) => E(Dropdown.Item,
                             { onClick: (e) => {
                                 this.setArchive(a)
                             } },
                             moment.utc(a.time).fromNow())
                )

            var curArchive = E(LoadingIndicator)
            if ( this.state.curArchive ) {
                curArchive = moment.utc(this.state.curArchive.time).fromNow()
            }

            return E('div', null,
                     E('div', { className: 'd-flex flex-row align-items-center' },
                       E(Link, {to: '/'}, E('i', { className: 'fa fa-chevron-left fa-fw fa-2x'})),
                       E('h4', { className: 'p-2' }, this.state.backup.name),
                       E('div', { className: 'ml-auto' },
                         E(Dropdown, null,
                           E(Dropdown.Toggle, null, curArchive),

                           E(Dropdown.Menu, null, archives)))),

                     E(Route, { path: '/backups/:backupId/:archiveName',
                                render: ({match, location}) => {
                                    var remaining = location.pathname.substring(match.url.length)
                                    if ( remaining.length == 0 )
                                        remaining = '/';

                                    if ( this.state.curArchive === null && this.state.archiveMap && this.state.archiveMap[match.params.archiveName] )
                                        setTimeout(() => { this.setState({curArchive: this.state.archiveMap[match.params.archiveName]}) }, 0)

                                    // console.log("Reamining", remaining, location.pathname, match.url)

                                    return [ E(Breadcrumbs, { key: 'path', path: remaining, backupId: match.params.backupId, archiveName: match.params.archiveName }),
                                             E(BackupTree, { key: `${match.params.backupId}-${match.params.archiveName}-${remaining}`,
                                                             path: remaining, backupId: match.params.backupId, archiveName: match.params.archiveName }) ]

                                } }),
                     E(Route, { path: '/backups/:backupId', exact: true,
                                render: ({match, location}) => {
                                    console.log("At backupId", this.state.archives, this.needsArchive)
                                    if ( this.state.archives ) {
                                        this.setArchive(this.state.archives[0])
                                    } else
                                        this.needsArchive = true
                                    return E(LoadingIndicator)
                                }}))

        } else {
            return E(LoadingIndicator)
        }
    }
}

const BackupBrowserWithRouter = withRouter(BackupBrowser);

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

        fetch('intrustd+app://backups.intrustd.com/backups',
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
        fetch('intrustd+app://backups.intrustd.com/backups',
              { method: 'GET', cache: 'no-store' })
            .then((r) => {
                if ( r.status == 200 )
                    r.json().then((backups) => { this.setState({backups}) })
                else {
                    this.setState({error: `Unexpected status: ${r.status}`})
                    r.text().then((e) => {
                        this.setState({error: `Unexpected status: ${r.status}: ${e}`})
                    })
                }
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
            E(Router, {},
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

                E(Route, { path: '/', exact: true,
                           render: ({}) => {
                               if ( this.state.error )
                                   return E(Alert, { variant: 'danger' },
                                            this.state.error)
                               else if ( this.state.backups === undefined )
                                   return E(LoadingIndicator)
                               else
                                   return E(Backups, { backups: this.state.backups })
                           } }),

                E(Route, { path: '/backups/:backupId',
                           render: ({match}) => {
                               return E(BackupBrowserWithRouter,
                                        { backupId: match.params.backupId,
                                          key: `browse-${match.params.backupId}` })
                           } }),

                  createBackupModal
               ))
        ];
    }
}

var container = document.createElement('div');
document.body.appendChild(container)
ReactDom.render(react.createElement(BackupsApp), container)

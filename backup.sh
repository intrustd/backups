#!@bash@/bin/bash

LOCAL_VERSION=1

echo "version ${LOCAL_VERSION}"

PEER="$SOCAT_PEERADDR"
CURL="@curl@/bin/curl"
JQ="@jq@/bin/jq"
GREP="@gnugrep@/bin/grep"
SED="@gnused@/bin/sed"

fail_proto () {
    echo "error $1"
    exit 1
}

get_backups() {
    $CURL -s -X GET http://admin.intrustd.com.app.local/$PEER/permissions 2>/dev/null | $JQ -r '.[]' | $GREP '^intrustd+perm://backups.intrustd.com/backup/' | $GREP '/transfer$' | $SED 's,^intrustd+perm://backups.intrustd.com/backup/\([0-9a-fA-F\-]\+\)/transfer$,\1,'
}

DEBUG_LEVEL=""
DEBUG_TOPICS=""

while read -r line; do
    case "$line" in
        version*)
            REMOTE_VERSION=${line##version }
            if ! [ "$REMOTE_VERSION" -eq "$REMOTE_VERSION" ] 2>/dev/null; then
                fail_proto "400 version must be an integer"
            fi

            if [ "$REMOTE_VERSION" -gt "$LOCAL_VERSION" ]; then
                fail_proto "400 version not supported"
            fi
            ;;

        start)
            BACKUP_ID=$(get_backups | head)
            if [ -z "$BACKUP_ID" ]; then
                echo "401 No backups authorized"
                exit 2
            else
                CLIENT_NAME="$BACKUP_ID"
            fi
            break;
            ;;

        auth*)
            TOKEN=${line##auth }
            if [[ "$TOKEN" =~ ^[0-9a-fA-F]{64}$ ]]; then
                # Request admin app to add this token to the remote address
                $CURL -X POST http://admin.intrustd.com.app.local/$PEER/tokens \
                      -H 'Content-Type: application/json' \
                      -H 'Accept: application/json' \
                      -d '["'$TOKEN'"]' --fail -s >/dev/null 2>/dev/null
                CURL_RES="$?"
                if [ "$CURL_RES" -eq 0 ]; then
                    echo "200 Success"
                elif [ "$CURL_RES" -eq 22 ]; then
                    echo "401 Token could not be added"
                fi
            else
                fail_proto "Invalid token"
            fi
            ;;

        info)
            BACKUPS=$(get_backups | head -1)
            if [ -z "$BACKUPS" ]; then
                echo "400 No Backups"
            else
                if [ ! -f /intrustd/"$BACKUPS"/intrustd.json ]; then
                    echo "404 Backup not found"
                else
                    REMOTE_PERSONA=$($CURL http://admin.intrustd.com.app.local/container/$PEER -H 'Accept: application/json' --fail -s 2>/dev/null | $JQ -r .persona_id)

                    if [ -z "$REMOTE_PERSONA" ]; then
                        echo "403 No persona found"
                    else
                        PERSONA_INFO=$($CURL http://admin.intrustd.com.app.local/personas/"$REMOTE_PERSONA" -H 'Accept: application/json' --fail -s 2>/dev/null)
                        BACKUP_INFO=$(cat /intrustd/"$BACKUPS"/intrustd.json)
                        read -r -d '' RETDATA <<EOF
{ "container": ${PERSONA_INFO},
  "backup": ${BACKUP_INFO},
  "id": "${BACKUPS}" }
EOF
                        RETDATA=$(echo "$RETDATA" | $JQ -rcM '{name: .backup.name, description: .backup.description, backupType: .backup.backupType, display_name: .container.persona.display_name, id: .id}')
                        echo "200 $RETDATA"
                    fi
                fi
            fi
            ;;

        renew)
            # This would request a new token and then claim this
            # backup for the new token
            BACKUPS=$(get_backups)
            BACKUP_TOKENS=""
            for backup_id in $BACKUPS; do
                BACKUP_TOKENS="$BACKUP_TOKENS\"intrustd+perm://backups.intrustd.com/backup/${backup_id}""\",\"intrustd+perm://backups.intrustd.com/backup/${backup_id}/transfer\","
            done
            read -r -d '' TOKENS <<EOF
{ "on_behalf_of": "$PEER",
  "permissions": [ $BACKUP_TOKENS
                   "intrustd+perm://admin.intrustd.com/site",
                   "intrustd+perm://admin.intrustd.com/login",
                   "intrustd+perm://admin.intrustd.com/login/transfer",
                   "intrustd+perm://admin.intrustd.com/site/transfer" ] }
EOF
            NEW_TOKEN_DATA=$($CURL -X POST http://admin.intrustd.com.app.local/tokens \
                                   -H 'Content-Type: application/json' \
                                   -H 'Accept: application/json' \
                                   -d "$TOKENS" --fail -s)
            if [ $? -eq 0 ]; then
                NEW_TOKEN=$(echo "$NEW_TOKEN_DATA" | $JQ -r .token)
                echo "200 $NEW_TOKEN"
            else
                echo "400 Could not mint token"
            fi
            ;;

        verbosity*)
            VERBOSITY=${line##verbosity }
            case "$VERBOSITY" in
                debug)
                    DEBUG_LEVEL="--debug"
                    ;;

                info)
                    DEBUG_LEVEL="--info"
                    ;;

                warning)
                    DEBUG_LEVEL=""
                    ;;

                error)
                    DEBUG_LEVEL="--error"
                    ;;

                critical)
                    DEBUG_LEVEL="--critical"
                    ;;

                *) ;;
            esac
            ;;

        debug*)
            TOPIC=${line##debug }
            DEBUG_TOPICS="${DEBUG_TOPICS} --debug-topic=${TOPIC}"
            ;;

        *) ;;
    esac
done

if [ -z "$REMOTE_VERSION" ]; then
    fail_proto "400 No version specified"
fi

STORAGE_QUOTA="" #TODO lookup
# CLIENT_NAME="test"
BACKUP_PATH="/intrustd/${CLIENT_NAME}"

exec @mux@/bin/mux @borg@/bin/borg $DEBUG_LEVEL $DEBUG_TOPICS serve $STORAGE_QUOTA --restrict-to-path="${BACKUP_PATH}"

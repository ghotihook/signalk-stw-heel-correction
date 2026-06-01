#!/bin/bash
set -e

SERVER=user@skserver.local   # <-- fill in

git push
ssh "$SERVER" "git -C ~/signalk-stw-heel-correction pull && sudo systemctl restart signalk"

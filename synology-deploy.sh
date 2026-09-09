find . -type f -exec chmod 644 {} \;
find . -type d -exec chmod 755 {} \;
chmod +x synology-deploy.sh
rsync -e 'ssh -p 222' -av --copy-links --delete ./ Sebastian@disk.wild-inter.net:/volume1/web/powersort/ --exclude=.git --exclude=.gitignore --exclude /synology-deploy.sh --exclude \*.zip --exclude powersorts-pursuit-v\* --exclude playground
ssh -p222 Sebastian@disk.wild-inter.net 'chmod -R go+r /volume1/web/*'

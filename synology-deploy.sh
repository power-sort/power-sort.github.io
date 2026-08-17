find . -type f -exec chmod 644 {} \;
find . -type d -exec chmod 755 {} \;
chmod +x synology-deploy.sh
rsync -e 'ssh -p 222' -av --copy-links --delete ./ Sebastian@disk.wild-inter.net:/volume1/web/powersort/ --exclude=.git --exclude=.gitignore --exclude /synology-deploy.sh --exclude powersort-site.zip --exclude powersort-site-v3.zip
ssh -p222 Sebastian@syno 'chmod -R go+r /volume1/web/*'

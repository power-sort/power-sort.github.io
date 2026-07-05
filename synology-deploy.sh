rsync -e 'ssh -p 222' -av --delete ./ Sebastian@disk.wild-inter.net:/volume1/web/powersort/ --exclude=.git --exclude=.gitignore --exclude synology-deploy.sh

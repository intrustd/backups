# Always prefer setuptools over distutils
from setuptools import setup, find_packages
from os import path

setup(
    name="intrustd-backups",
    version="0.1.0",
    description="Intrustd Backup App",
    packages=find_packages(),
    install_requires=["Flask>=0.2", "intrustd-support", "borgbackup" ],
    entry_points={
        'console_scripts': [ 'backups-meta-api=intrustd.backups.main:main', 'backup-perms=intrustd.backups.perms:verify' ]
    }
)

import <intrustd/nix/hydra-app-jobsets.nix> {
  description = "Intrustd Backup App";
  src = { type = "git"; value = "git://github.com/intrustd/backups.git"; emailresponsible = true; };
}

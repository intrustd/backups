let pkgs = import <nixpkgs> {};
in {
  jobsets =
    let spec = {
          app = {
            description = "Intrustd Backup App";
            enabled = 1;
            hidden = false;
            nixexprinput = "src";
            nixexprpath = "build-hydra-test.nix";
            checkinterval = 300;
            schedulingshares = 50;
            enableemail = true;
            emailoverride = "";
            keepnr = 3;
            inputs = {
              src = { type = "git"; value = "git://github.com/intrustd/backups.git"; emailresponsible = true; };
              nixpkgs = { type = "git"; value = "git://github.com/intrustd/nixpkgs.git intrustd"; emailresponsible = true; };
              intrustd = { type = "git"; value = "git://github.com/intrustd/daemon.git"; emailresponsible = true; };
              system = { type = "git"; value = "git://github.com/intrustd/appliance.git"; emailresponsible = true; };
            };
          };
        };
    in pkgs.writeText "spec.json" (builtins.toJSON spec);
}

# import <intrustd/nix/hydra-app-jobsets.nix> {
#   description = "Intrustd Backup App";
#   src = { type = "git"; value = "git://github.com/intrustd/backups.git"; emailresponsible = true; };
# }

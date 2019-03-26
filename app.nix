{ pkgs, intrustd, pure-build, ... }:

let intrustd-py = (import ./shell.nix {}).intrustd-py;

    pypkgs = pkgs.python3Packages;
#    (pkgs.python3.override {
#       packageOverrides = self: super: {
#         cython = super.cython.override { gdb = null; };
#       };
#    }).pkgs;

    backup-app = pypkgs.buildPythonPackage rec {
      pname = "intrustd-backups";
      version = "0.1.0";

      src = ./.; #if pure-build then ./. else ./dist/intrustd-backups-0.1.0.tar.gz;

      doCheck = false;

      propagatedBuildInputs = with pypkgs; [ flask intrustd-py borg ];
    };

    mux = pkgs.stdenv.mkDerivation {
      name = "mux";
      src = ./mux;
      buildPhase = ''
        $CC -o mux ./mux.c -O2
      '';
      installPhase = ''
        mkdir -p $out/bin
        cp mux $out/bin/mux
      '';
    };

    borg = pkgs.borgbackup.override { python3Packages = pypkgs; withDocs = false; };

in {
  app.meta = {
    slug = "backups";
    name = "Intrustd Backups";
    authors = [ "Travis Athougies<travis@athougies.net>" ];
    app-url = "https://backups.intrustd.com/";
    icon = "https://backups.intrustd.com/images/backups.svg";
  };

  app.identifier = "backups.intrustd.com";

#  app.services.backup-service =
#    let server =  pkgs.substituteAll {
#                    isExecutable = true;
#                    src = ./backup.sh;
#                    inherit borg;
#                    inherit mux;
#                    inherit (pkgs) bash curl jq;
#                  };
#    in {
#      autostart = true;
#      name = "backup-service";
#      startExec = "${pkgs.socat}/bin/socat TCP-LISTEN:22,reuseaddr,fork exec:${server},stderr";
#    };
#
 app.services.backup-api = {
   name = "backup";
   autostart = true;

   startExec = ''
     exec ${backup-app}/bin/backups-meta-api
   '';
 };

  app.permsHook = "${backup-app}/bin/backup-perms";

  app.permissions = [
    { name = "admin";
      description = "Administer backups"; }

    { name = "meta";
      description = "Get meta information for backups";
      dynamic = true; }

    { name = "browse";
      description = "Browse files in backups";
      dynamic = true; }

    { regex = "backup/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89aAbB][a-f0-9]{3}-[a-f0-9]{12}";
      description = "Save backups";
      dynamic = true;
    }

    { regex = "browse/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89aAbB][a-f0-9]{3}-[a-f0-9]{12}";
      description = "Browse a particular backup";
      dynamic = true; }
  ];
}

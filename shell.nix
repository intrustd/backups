{ pkgs ? import <nixpkgs> {} }:

let intrustd-py-srcs =
      pkgs.fetchFromGitHub {
        owner = "intrustd";
        repo = "py-intrustd";
        rev = "8d4900d01845c114db0ede7bfc2773b895264e15";
        sha256 = "1qbg9kz57pwk0mbqz1ppp622cc8srfarmmih4rn4vfhg71y6mijp";
      };

    intrustd-py = pkgs.callPackage intrustd-py-srcs { };

in

pkgs.stdenv.mkDerivation {
  name = "intrustd-backups";

  buildInputs = [ (pkgs.python3.withPackages (ps: with ps; [ flask intrustd-py (toPythonModule pkgs.borgbackup) ])) ];

  inherit intrustd-py;
}

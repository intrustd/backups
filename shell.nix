{ pkgs ? import <nixpkgs> {} }:

let intrustd-py-srcs = ../../py;
    # pkgs.fetchFromGitHub {
    #   owner = "intrustd";
    #   repo = "py-intrustd";
    #   rev = "c8cf38de51c2b2249b2c57fa01b29b554b248c42";
    #   sha256 = "0gfh44v1nn6hnlmw011qli20nn1lly6rql326kd087ighil9b6g2";
    # };

    intrustd-py = pkgs.callPackage intrustd-py-srcs { };

in

pkgs.stdenv.mkDerivation {
  name = "intrustd-backups";

  buildInputs = [ (pkgs.python3.withPackages (ps: with ps; [ flask intrustd-py (toPythonModule pkgs.borgbackup) ])) ];

  inherit intrustd-py;
}

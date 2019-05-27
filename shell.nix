{ pkgs ? import <nixpkgs> {} }:

let intrustd-py-srcs =
      pkgs.fetchFromGitHub {
        owner = "intrustd";
        repo = "py-intrustd";
        rev = "3ded67ad1d153f7d3e969fce2f26e5f737a2a1c8";
        sha256 = "14dkz41n81vfppab2k4b8mc25ciqzwsr1wrw6slbsxi1znvdajsk";
      };

    intrustd-py = pkgs.callPackage intrustd-py-srcs { };

in

pkgs.stdenv.mkDerivation {
  name = "intrustd-backups";

  buildInputs = [ (pkgs.python3.withPackages (ps: with ps; [ flask intrustd-py sqlalchemy ])) pkgs.borgbackup pkgs.nodePackages.node2nix ];

  inherit intrustd-py;
}

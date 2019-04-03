{ pkgs ? import <nixpkgs> {} }:

let intrustd-py-srcs =
      pkgs.fetchFromGitHub {
        owner = "intrustd";
        repo = "py-intrustd";
        rev = "623bf3b701f8381fad56c082e38b211f9d782474";
        sha256 = "042m5z1pcb1v6jz8qwqw7366md2gyrpblzpbs64iamfcwdx57sc0";
      };

    intrustd-py = pkgs.callPackage intrustd-py-srcs { };

in

pkgs.stdenv.mkDerivation {
  name = "intrustd-backups";

  buildInputs = [ (pkgs.python3.withPackages (ps: with ps; [ flask intrustd-py sqlalchemy ])) pkgs.borgbackup pkgs.nodePackages.node2nix ];

  inherit intrustd-py;
}

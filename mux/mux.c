/* Utility program that spawns a child and then muxes the child's stdout and stderr over stdout */

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <arpa/inet.h>
#include <sys/wait.h>

#define BUF_SIZE 1024

#define MUX_STDOUT 1
#define MUX_STDERR 2
#define MUX_EXITCODE 3

typedef struct {
  uint8_t op;
  uint16_t len;
} __attribute__((packed)) muxhdr;

static sig_atomic_t has_exited = 0;
static void handle_sigchld(int sig) {
  has_exited = 1;
}

static void set_nonblock(int fd) {
  int flags = fcntl(fd, F_GETFL);
  if ( flags == -1 ) {
    perror("set_nonblock: F_GETFL");
    exit(1);
  }

  flags = fcntl(fd, F_SETFL, flags | O_NONBLOCK);
  if ( flags == -1 ) {
    perror("set_nonblock: F_SETFL");
    exit(1);
  }
}

static void send_frame(int op, char *buf, uint16_t blen) {
  muxhdr hdr;
  int err;

  hdr.op = op;
  hdr.len = htons(blen);

  err = write(STDOUT_FILENO, &hdr, sizeof(hdr));
  if ( err < 0 ) {
    perror("write");
    exit(3);
  }

  err = write(STDOUT_FILENO, buf, blen);
  if ( err < 0 ) {
    perror("write");
    exit(3);
  }
}

int main(int argc, const char **argv) {
  char buf[BUF_SIZE];

  int stdout_p[2], stderr_p[2], err;

  pid_t child;

  char **new_argv;

  struct sigaction sc_hl, sp_hl;
  sigset_t all, mask;

  if ( argc < 2 ) {
    fprintf(stderr, "%s - expected a command to run\n", argv[0]);
    return 1;
  }

  new_argv = malloc(sizeof(*argv) * argc);
  if ( !new_argv ) {
    fprintf(stderr, "Out of memory\n");
    return 1;
  }
  memcpy(new_argv, argv + 1, sizeof(*argv) * (argc - 1));
  new_argv[argc - 1] = NULL;

  err = pipe(stdout_p);
  if ( err < 0 ) {
    perror("pipe(stdout_p)");
    return 1;
  }

  err = pipe(stderr_p);
  if ( err < 0 ) {
    perror("pipe(stderr_p)");
    return 1;
  }

  sc_hl.sa_handler = handle_sigchld;
  sigemptyset(&sc_hl.sa_mask);
  sc_hl.sa_flags = SA_NOCLDSTOP;
  if ( sigaction(SIGCHLD, &sc_hl, 0) < 0 ) {
    perror("sigaction(SIGCHLD)");
    return 1;
  }

  signal(SIGPIPE, SIG_IGN);

  sigfillset(&all);
  err = sigprocmask(SIG_SETMASK, &all, &mask);
  if ( err < 0 ) {
    perror("sigprocmask");
    return 1;
  }

  child = fork();
  if ( child < 0 ) {
    perror("fork");
    return 1;
  }

  if ( child == 0 ) {
    close(stdout_p[0]);
    close(stderr_p[0]);

    err = dup2(stdout_p[1], STDOUT_FILENO);
    if ( err < 0 ) {
      perror("dup2(stdout)");
      return 1;
    }

    err = dup2(stderr_p[1], STDERR_FILENO);
    if ( err < 0 ) {
      perror("dup2(stderr)");
      return 1;
    }

    close(stdout_p[1]);
    close(stderr_p[1]);

    execvp(new_argv[0], new_argv);
    exit(1);
  } else {
    close(STDIN_FILENO);
    close(stdout_p[1]);
    close(stderr_p[1]);

    set_nonblock(stdout_p[0]);
    set_nonblock(stderr_p[0]);

    while (1) {
      fd_set rfds, efds;

      FD_ZERO(&rfds);
      FD_ZERO(&efds);

      if ( stdout_p[0] ) {
        FD_SET(stdout_p[0], &rfds);
        FD_SET(stdout_p[0], &efds);
      }

      if ( stderr_p[0] ) {
        FD_SET(stderr_p[0], &rfds);
        FD_SET(stderr_p[0], &efds);
      }

      sigemptyset(&mask);
      err = pselect((stdout_p[0] > stderr_p[0] ? stdout_p[0] : stderr_p[0]) + 1,
                    &rfds, NULL, &efds, NULL, &mask);
      if ( err < 0 ) {
        if ( errno == EAGAIN || errno == EINTR ) {
          if ( has_exited ) {
            int sts;
            pid_t wres = waitpid(child, &sts, WNOHANG);
            if ( wres < 0 ) {
              perror("waitpid");
              return 1;
            } else if ( wres == 0 ) continue;
            else {
              int8_t sts8 = sts;
              send_frame(MUX_EXITCODE, &sts8, sizeof(sts8));
              break;
            }
          } else
            continue;
        } else {
          perror("select");
          return 1;
        }
      }

      if ( FD_ISSET(stdout_p[0], &rfds) ||
           FD_ISSET(stdout_p[0], &efds) ) {
        err = read(stdout_p[0], buf, sizeof(buf));
        if ( err <= 0 ) {
          if ( errno == EPIPE || err == 0 ) {
            close(stdout_p[0]);
            stdout_p[0] = 0;
            err = 0;
          } else if ( errno != EAGAIN &&
                      errno != EINTR ) {
            perror("read(stdout)");
            return 1;
          }
        }

        if ( err )
          send_frame(MUX_STDOUT, buf, err);
      }

      if ( FD_ISSET(stderr_p[0], &rfds) ||
           FD_ISSET(stderr_p[0], &efds) ) {
        err = read(stderr_p[0], buf, sizeof(buf));
        if ( err <= 0 ) {
          if ( errno == EPIPE || err == 0) {
            close(stderr_p[0]);
            stderr_p[0] = 0;
            err = 0;
          } else if ( errno != EAGAIN &&
                      errno != EINTR ) {
            perror("read(stderr)");
            return 1;
          }
        }

        if ( err )
          send_frame(MUX_STDERR, buf, err);
      }
    }
  }

  return 0;
}

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <signal.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <arpa/inet.h>

#define BUF_SIZE 1024

#define MUX_STDOUT 1
#define MUX_STDERR 2
#define MUX_EXITCODE 3

#define MIN(a, b) ((a) < (b) ? (a) : (b))

#if DEBUG
FILE *logfp = NULL;
#endif

typedef struct {
  uint8_t op;
  uint16_t len;
} __attribute__((packed)) muxhdr;

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

int main(int argc, const char **argv) {
  enum { ST_READ_OP,
         ST_READ_FRAME } state = ST_READ_OP;
  uint8_t buf[BUF_SIZE];
  unsigned int buf_pos = 0;
  muxhdr cur_hdr;

  set_nonblock(STDIN_FILENO);
  signal(SIGPIPE, SIG_IGN);

#if DEBUG
  logfp = fopen("log", "wt");
#endif

  while ( 1 ) {
    int err;

    if ( buf_pos == 0 || (state == ST_READ_OP && buf_pos < sizeof(muxhdr)) ) {
      fd_set rfds;

      FD_SET(STDIN_FILENO, &rfds);

      err = select(STDIN_FILENO + 1, &rfds, NULL, NULL, NULL);
      if ( err < 0 ) {
        perror("select");
        return 127;
      }

      err = read(STDIN_FILENO, buf + buf_pos, sizeof(buf) - buf_pos);
      if ( err <= 0 ) {
        if ( errno == EPIPE || err == 0 )
          return 128;
        else {
          perror("read");
          return 129;
        }
      } else
        buf_pos += err;
    }

#if DEBUG
    fprintf(logfp, "Going to parse data: %d %d %d (op = %d)\n", state, err, buf_pos, cur_hdr.op);
    fflush(logfp);
#endif

    switch ( state ) {
    case ST_READ_OP:
      if ( buf_pos >= sizeof(muxhdr) ) {
        memcpy(&cur_hdr, buf, sizeof(muxhdr));
        memcpy(buf, buf + sizeof(muxhdr), buf_pos - sizeof(muxhdr));
        buf_pos -= sizeof(muxhdr);
        cur_hdr.len = ntohs(cur_hdr.len);

        state = ST_READ_FRAME;
      }
      break;

    case ST_READ_FRAME:
      //      fprintf(stderr, "Pos bef: %d, len %d\n", buf_pos, cur_hdr.len);
      switch ( cur_hdr.op ) {
      case MUX_STDOUT:
        err = write(STDOUT_FILENO, buf, MIN(cur_hdr.len, buf_pos) );
        if ( err < 0 ) {
          perror("write(stdout)");
          return 127;
        }

        if ( cur_hdr.len < err )
          cur_hdr.len = 0;
        else
          cur_hdr.len -= err;

        memcpy(buf, buf + err, buf_pos - err);
        buf_pos -= err;
        break;

      case MUX_STDERR:
        err = write(STDERR_FILENO, buf, MIN(cur_hdr.len, buf_pos) );
        if ( err < 0 ) {
          perror("write(stderr)");
          return 127;
        }

        if ( cur_hdr.len < err )
          cur_hdr.len = 0;
        else
          cur_hdr.len -= err;

        //fprintf(stderr, "Wrote %d: %d\n", err, cur_hdr.len);

        memcpy(buf, buf + err, buf_pos - err);
        buf_pos -= err;
        break;

      case MUX_EXITCODE:
        return WEXITSTATUS(buf[buf_pos - 1]);
      }
      //      fprintf(stderr, "Pos aft: %d\n", buf_pos);
      if ( cur_hdr.len == 0 )
        state = ST_READ_OP;
      break;
    default:
      return 127;
    }
  }
}

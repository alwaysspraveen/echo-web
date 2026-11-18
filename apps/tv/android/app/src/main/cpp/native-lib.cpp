// Starts Node.js for Mobile (libnode) with the given arguments, and sends its output to logcat.
#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <pthread.h>
#include <unistd.h>
#include <android/log.h>
#include "node.h"

static int pipe_stdout[2], pipe_stderr[2];

static void *log_thread(void *arg) {
    int fd = *(int *)arg;
    int prio = fd == pipe_stdout[0] ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR;
    char buf[2048];
    ssize_t n;
    while ((n = read(fd, buf, sizeof buf - 1)) > 0) {
        buf[n] = 0;
        if (buf[n - 1] == '\n') buf[n - 1] = 0;
        __android_log_write(prio, "EchoNode", buf);
    }
    return nullptr;
}

static void redirect_output() {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    pipe(pipe_stdout);
    pipe(pipe_stderr);
    dup2(pipe_stdout[1], STDOUT_FILENO);
    dup2(pipe_stderr[1], STDERR_FILENO);
    pthread_t t1, t2;
    pthread_create(&t1, nullptr, log_thread, &pipe_stdout[0]);
    pthread_create(&t2, nullptr, log_thread, &pipe_stderr[0]);
    pthread_detach(t1);
    pthread_detach(t2);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_praveen_echomusic_tv_NodeRunner_startNode(JNIEnv *env, jclass, jobjectArray arguments) {
    redirect_output();
    jsize count = env->GetArrayLength(arguments);
    // node::Start wants all arguments in one contiguous block.
    size_t total = 0;
    for (jsize i = 0; i < count; i++) {
        auto s = (jstring)env->GetObjectArrayElement(arguments, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        total += strlen(c) + 1;
        env->ReleaseStringUTFChars(s, c);
    }
    char *block = (char *)calloc(total, 1);
    char **argv = (char **)calloc(count + 1, sizeof(char *));
    char *pos = block;
    for (jsize i = 0; i < count; i++) {
        auto s = (jstring)env->GetObjectArrayElement(arguments, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        size_t len = strlen(c);
        memcpy(pos, c, len);
        argv[i] = pos;
        pos += len + 1;
        env->ReleaseStringUTFChars(s, c);
    }
    return node::Start(count, argv);
}

# Git Commands Summary

## Initial Setup

1. **Clone a Remote Repository**
   ```bash
   git clone <repository-url>
   ```

2. **Check Remote Repository**
   ```bash
   git remote -v
   ```

## Branch Management

3. **Create a New Branch**
   ```bash
   git checkout -b <branch-name>
   ```

4. **List All Branches**
   ```bash
   git branch
   ```

5. **Switch to an Existing Branch**
   ```bash
   git checkout <branch-name>
   ```

6. **Merge a Branch into Current Branch**
   ```bash
   git merge <branch-name>
   ```

7. **Delete a Local Branch**
   ```bash
   git branch -d <branch-name>
   ```

8. **Force Delete a Local Branch**
   ```bash
   git branch -D <branch-name>
   ```

## Remote Branch Management

9. **Push a New Branch to Remote**
   ```bash
   git push origin <branch-name>
   ```

10. **Push Changes to Remote Branch**
    ```bash
    git push
    ```

11. **Fetch Changes from Remote**
    ```bash
    git fetch
    ```

12. **Pull Changes from Remote**
    ```bash
    git pull
    ```

13. **Delete a Remote Branch**
    ```bash
    git push origin --delete <branch-name>
    ```

## Viewing Changes

14. **Check Status of Repository**
    ```bash
    git status
    ```

15. **View Commit History**
    ```bash
    git log
    ```

16. **View Changes in Files**
    ```bash
    git diff
    ```

## Staging and Committing Changes

17. **Stage Changes**
    ```bash
    git add <file-name>
    ```

18. **Stage All Changes**
    ```bash
    git add .
    ```

19. **Commit Changes**
    ```bash
    git commit -m "Your commit message"
    ```

20. **Amend Last Commit**
    ```bash
    git commit --amend
    ```

## Additional Commands

21. **Undo Last Commit (Keep Changes)**
    ```bash
    git reset HEAD~
    ```

22. **Undo Last Commit (Discard Changes)**
    ```bash
    git reset --hard HEAD~
    ```

## Conclusion

This summary provides a quick reference for managing your Git repository effectively. For more detailed information, refer to the official Git documentation.
```

You can save this content in a file named `GIT_COMMANDS.md` in your project directory. This will serve as a handy reference for managing your Git workflow.
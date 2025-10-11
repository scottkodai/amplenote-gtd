# Git Commands Summary

## Initial Setup
1. **Clone a Remote Repository**
   git clone <repository-url>

2. **Check Remote Repository**
   git remote -v

## Branch Management
3. **Create a New Branch**
   git checkout -b <branch-name>

4. **List All Branches**
   git branch

5. **Switch to an Existing Branch**
   git checkout <branch-name>

6. **Merge a Branch into Current Branch**
   git merge <branch-name>

7. **Delete a Local Branch**
   git branch -d <branch-name>

8. **Force Delete a Local Branch**
   git branch -D <branch-name>

## Remote Branch Management
9. **Push a New Branch to Remote**
   git push origin <branch-name>

10. **Push Changes to Remote Branch**
    git push

11. **Fetch Changes from Remote**
    git fetch

12. **Pull Changes from Remote**
    git pull

13. **Delete a Remote Branch**
    git push origin --delete <branch-name>
## Viewing Changes

14. **Check Status of Repository**
    git status

15. **View Commit History**
    git log

16. **View Changes in Files**
    git diff
## Staging and Committing Changes

17. **Stage Changes**
    git add <file-name>

18. **Stage All Changes**
    git add .

19. **Commit Changes**
    git commit -m "Your commit message"

20. **Amend Last Commit**
    git commit --amend
## Additional Commands

21. **Undo Last Commit (Keep Changes)**
    git reset HEAD~

22. **Undo Last Commit (Discard Changes)**
    git reset --hard HEAD~